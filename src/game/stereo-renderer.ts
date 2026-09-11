import * as THREE from 'three'

/** Output layouts supported by the optional stereo compositor. */
export type StereoMode = 'off' | 'sbs' | 'crossview' | 'interlaced' | 'interlaced-reversed'

export interface StereoSettings {
  mode: StereoMode
  /** Eye separation in the world's rendered units. */
  separation: number
  /** Distance at which the two eye views converge, in rendered units. */
  convergence: number
  /** Apply this configuration automatically when the app starts. */
  defaultEnabled: boolean
}

export const DEFAULT_STEREO_SETTINGS: StereoSettings = {
  mode: 'off',
  separation: 0.08,
  convergence: 20,
  defaultEnabled: false,
}

const modeIndex: Record<StereoMode, number> = {
  off: 0,
  sbs: 1,
  crossview: 2,
  interlaced: 3,
  'interlaced-reversed': 4,
}

// Pixel-unit policy. Three's WebGLRenderer.setViewport takes CSS/logical
// units and scales by the pixel ratio internally, so this renderer never
// calls setViewport with drawing-buffer dimensions: setRenderTarget selects
// the full target/canvas viewport on its own. All sizes below are physical
// framebuffer pixels unless the name says otherwise.
export interface StereoTargetSizes {
  eyeTargetWidth: number
  eyeTargetHeight: number
}

/** Physical eye-target size for a mode, buffer size and eye render scale. */
export function computeStereoTargetSizes(mode: StereoMode, drawingBufferWidth: number, drawingBufferHeight: number, eyeRenderScale: number): StereoTargetSizes {
  const bufferWidth = Math.max(1, Math.floor(drawingBufferWidth))
  const bufferHeight = Math.max(1, Math.floor(drawingBufferHeight))
  const baseWidth = mode === 'sbs' || mode === 'crossview' ? Math.max(1, Math.floor(bufferWidth / 2)) : bufferWidth
  const scale = Number.isFinite(eyeRenderScale) && eyeRenderScale > 0 ? Math.min(1, eyeRenderScale) : 1
  return { eyeTargetWidth: Math.max(1, Math.floor(baseWidth * scale)), eyeTargetHeight: Math.max(1, Math.floor(bufferHeight * scale)) }
}

/** Canvas backing-store pixel ratio for a mode. Interlaced keeps full
 * physical rows (1:1 compositor-row to display-row parity) while the eye
 * buffers absorb adaptive scaling; other modes follow the render budget. */
export function computeCanvasPixelRatio(mode: StereoMode, budgetRatio: number, budgetMaximum: number, devicePixelRatio: number): number {
  if (mode !== 'interlaced' && mode !== 'interlaced-reversed') return budgetRatio
  return Math.min(devicePixelRatio, Math.max(budgetMaximum, 1))
}

/** Eye-buffer scale relative to the canvas backing store. Always <= 1. */
export function computeEyeRenderScale(canvasPixelRatio: number, budgetRatio: number): number {
  if (!(canvasPixelRatio > 0)) return 1
  return Math.min(1, budgetRatio / canvasPixelRatio)
}

// Parallel off-axis stereo. Both eyes keep the main camera orientation and
// are displaced by half the separation along its local X axis; the
// zero-parallax plane sits at the convergence distance via an asymmetric
// frustum shift, never a camera rotation. With separation 0 the shift is 0
// and each eye reproduces the main projection exactly.
export function offAxisProjectionShift(separation: number, convergence: number, fovDegrees: number, aspect: number): number {
  if (!(separation > 0) || !(convergence > 0) || !(aspect > 0)) return 0
  const halfFovTan = Math.tan(THREE.MathUtils.degToRad(fovDegrees) / 2)
  if (!(halfFovTan > 0)) return 0
  return separation / (2 * convergence * halfFovTan * aspect)
}

/** Position an eye camera parallel to the main camera with its frustum
 * shifted so the convergence plane stays centered. side -1 is the left eye. */
export function updateStereoEyeCamera(main: THREE.PerspectiveCamera, eye: THREE.PerspectiveCamera, side: -1 | 1, separation: number, convergence: number, aspect: number) {
  main.updateMatrixWorld()
  eye.fov = main.fov
  eye.aspect = aspect
  eye.near = main.near
  eye.far = main.far
  eye.up.copy(main.up)
  const rotation = new THREE.Quaternion().setFromRotationMatrix(main.matrixWorld)
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation).normalize()
  eye.position.setFromMatrixPosition(main.matrixWorld).addScaledVector(right, side * separation * 0.5)
  eye.quaternion.copy(rotation)
  eye.updateProjectionMatrix()
  const shift = offAxisProjectionShift(separation, convergence, main.fov, aspect)
  eye.projectionMatrix.elements[8]! += side < 0 ? shift : -shift
  eye.projectionMatrixInverse.copy(eye.projectionMatrix).invert()
  eye.updateMatrixWorld()
}

/**
 * Renders the game twice and composites the two views into one canvas.
 *
 * The normal (off) path remains a single renderer.render call. Stereo uses
 * parallel off-axis eye cameras and a small fullscreen shader, keeping
 * physics, scene ownership and audio completely independent of display mode.
 * Gamma, color management and material blending are intentionally untouched.
 */
export class StereoRenderer {
  private readonly renderer: THREE.WebGLRenderer
  private readonly leftCamera = new THREE.PerspectiveCamera()
  private readonly rightCamera = new THREE.PerspectiveCamera()
  private readonly leftTarget: THREE.WebGLRenderTarget
  private readonly rightTarget: THREE.WebGLRenderTarget
  private readonly compositeScene = new THREE.Scene()
  private readonly compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly compositeMaterial: THREE.ShaderMaterial
  private readonly compositeQuad: THREE.Mesh
  private readonly scratchBufferSize = new THREE.Vector2()
  private settings: StereoSettings = { ...DEFAULT_STEREO_SETTINGS }
  private budgetRatio = 1
  private budgetMaximum = 1
  private devicePixelRatio = 1
  private cachedMode: StereoMode | '' = ''
  private cachedDrawingBufferWidth = 0
  private cachedDrawingBufferHeight = 0
  private cachedEyeTargetWidth = 0
  private cachedEyeTargetHeight = 0

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer
    const targetOptions: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false,
    }
    this.leftTarget = new THREE.WebGLRenderTarget(1, 1, targetOptions)
    this.rightTarget = new THREE.WebGLRenderTarget(1, 1, targetOptions)
    this.leftTarget.texture.name = 'Ballance Stereo Left'
    this.rightTarget.texture.name = 'Ballance Stereo Right'
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        leftTexture: { value: this.leftTarget.texture },
        rightTexture: { value: this.rightTarget.texture },
        mode: { value: modeIndex.off },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D leftTexture;
        uniform sampler2D rightTexture;
        uniform float mode;
        varying vec2 vUv;
        void main() {
          if (mode < 2.5) {
            // Side-by-side views use half-width render targets so geometry is
            // not stretched when the two images share the output canvas.
            if (vUv.x < 0.5) {
              if (mode < 1.5) gl_FragColor = texture2D(leftTexture, vec2(vUv.x * 2.0, vUv.y));
              else gl_FragColor = texture2D(rightTexture, vec2(vUv.x * 2.0, vUv.y));
            } else {
              if (mode < 1.5) gl_FragColor = texture2D(rightTexture, vec2((vUv.x - 0.5) * 2.0, vUv.y));
              else gl_FragColor = texture2D(leftTexture, vec2((vUv.x - 0.5) * 2.0, vUv.y));
            }
          } else {
            // gl_FragCoord is bottom-up, matching WebGL texture coordinates.
            // This addressing is only 1:1 with the display when the canvas
            // backing store runs at full physical resolution; see the size
            // policy in syncRenderSizes.
            bool useLeft = mod(floor(gl_FragCoord.y), 2.0) < 1.0;
            if (mode > 3.5) useLeft = !useLeft;
            if (useLeft) gl_FragColor = texture2D(leftTexture, vUv);
            else gl_FragColor = texture2D(rightTexture, vUv);
          }
          // Eye targets hold linear working-space color like any intermediate
          // target; convert on the way out so stereo matches the mono path.
          #include <colorspace_fragment>
        }
      `,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    this.compositeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMaterial)
    this.compositeQuad.frustumCulled = false
    this.compositeScene.add(this.compositeQuad)
  }

  setSettings(next: StereoSettings) {
    this.settings = {
      mode: next.mode,
      separation: THREE.MathUtils.clamp(Number.isFinite(next.separation) ? next.separation : DEFAULT_STEREO_SETTINGS.separation, 0, 1),
      convergence: THREE.MathUtils.clamp(Number.isFinite(next.convergence) ? next.convergence : DEFAULT_STEREO_SETTINGS.convergence, 1, 200),
      defaultEnabled: !!next.defaultEnabled,
    }
    this.compositeMaterial.uniforms.mode!.value = modeIndex[this.settings.mode]
  }

  getSettings(): StereoSettings {
    return { ...this.settings }
  }

  /** Adaptive render-budget scales; the canvas/eye split happens in sync. */
  setBudgetScale(budgetRatio: number, budgetMaximum: number, devicePixelRatio: number) {
    if (Number.isFinite(budgetRatio) && budgetRatio > 0) this.budgetRatio = budgetRatio
    if (Number.isFinite(budgetMaximum) && budgetMaximum > 0) this.budgetMaximum = budgetMaximum
    if (Number.isFinite(devicePixelRatio) && devicePixelRatio > 0) this.devicePixelRatio = devicePixelRatio
  }

  /** Owns the canvas-pixel-ratio and eye-target invariant. Only reallocates
   * backing stores when the computed dimensions actually change. */
  private syncRenderSizes() {
    const mode = this.settings.mode
    const canvasPixelRatio = computeCanvasPixelRatio(mode, this.budgetRatio, this.budgetMaximum, this.devicePixelRatio)
    if (Math.abs(this.renderer.getPixelRatio() - canvasPixelRatio) > 1e-6) this.renderer.setPixelRatio(canvasPixelRatio)
    this.renderer.getDrawingBufferSize(this.scratchBufferSize)
    const drawingBufferWidth = Math.max(1, Math.floor(this.scratchBufferSize.x))
    const drawingBufferHeight = Math.max(1, Math.floor(this.scratchBufferSize.y))
    const eyeRenderScale = mode === 'off' ? 1 : computeEyeRenderScale(canvasPixelRatio, this.budgetRatio)
    const { eyeTargetWidth, eyeTargetHeight } = computeStereoTargetSizes(mode, drawingBufferWidth, drawingBufferHeight, eyeRenderScale)
    if (mode !== this.cachedMode || drawingBufferWidth !== this.cachedDrawingBufferWidth || drawingBufferHeight !== this.cachedDrawingBufferHeight || eyeTargetWidth !== this.cachedEyeTargetWidth || eyeTargetHeight !== this.cachedEyeTargetHeight) {
      if (mode !== 'off') {
        this.leftTarget.setSize(eyeTargetWidth, eyeTargetHeight)
        this.rightTarget.setSize(eyeTargetWidth, eyeTargetHeight)
      }
      this.cachedMode = mode
      this.cachedDrawingBufferWidth = drawingBufferWidth
      this.cachedDrawingBufferHeight = drawingBufferHeight
      this.cachedEyeTargetWidth = eyeTargetWidth
      this.cachedEyeTargetHeight = eyeTargetHeight
    }
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.syncRenderSizes()
    if (this.settings.mode === 'off') {
      this.renderer.shadowMap.autoUpdate = true
      this.renderer.setRenderTarget(null)
      this.renderer.setScissorTest(false)
      this.renderer.render(scene, camera)
      return
    }

    // Both eyes share one shadow-map update per displayed frame; the second
    // eye reuses it. Shadow content depends only on lights and scene state,
    // which do not change between the two eye renders of the same frame.
    this.renderer.shadowMap.autoUpdate = false
    this.renderer.shadowMap.needsUpdate = true
    const eyeAspect = this.cachedEyeTargetWidth / Math.max(1, this.cachedEyeTargetHeight)
    updateStereoEyeCamera(camera, this.leftCamera, -1, this.settings.separation, this.settings.convergence, eyeAspect)
    updateStereoEyeCamera(camera, this.rightCamera, 1, this.settings.separation, this.settings.convergence, eyeAspect)

    this.renderer.setScissorTest(false)
    this.renderer.setRenderTarget(this.leftTarget)
    this.renderer.clear()
    this.renderer.render(scene, this.leftCamera)
    this.renderer.setRenderTarget(this.rightTarget)
    this.renderer.clear()
    this.renderer.render(scene, this.rightCamera)

    this.renderer.setRenderTarget(null)
    this.renderer.render(this.compositeScene, this.compositeCamera)
  }

  dispose() {
    this.leftTarget.dispose()
    this.rightTarget.dispose()
    this.compositeQuad.geometry.dispose()
    this.compositeMaterial.dispose()
  }
}
