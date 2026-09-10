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

/**
 * Renders the game twice and composites the two views into one canvas.
 *
 * The normal (off) path remains a single renderer.render call. Stereo uses
 * toe-in cameras and a small fullscreen shader, keeping physics, scene
 * ownership, shadows and audio completely independent of the display mode.
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
  private settings: StereoSettings = { ...DEFAULT_STEREO_SETTINGS }
  private outputWidth = 1
  private outputHeight = 1

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
    if (this.outputWidth > 1 && this.outputHeight > 1) this.resize(this.outputWidth, this.outputHeight)
  }

  getSettings(): StereoSettings {
    return { ...this.settings }
  }

  /** Resize render targets to the renderer's drawing-buffer dimensions. */
  resize(width: number, height: number) {
    this.outputWidth = Math.max(1, Math.floor(width))
    this.outputHeight = Math.max(1, Math.floor(height))
    const sideBySide = this.settings.mode === 'sbs' || this.settings.mode === 'crossview'
    const eyeWidth = sideBySide ? Math.max(1, Math.floor(this.outputWidth / 2)) : this.outputWidth
    this.leftTarget.setSize(eyeWidth, this.outputHeight)
    this.rightTarget.setSize(eyeWidth, this.outputHeight)
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    if (this.settings.mode === 'off') {
      this.renderer.setRenderTarget(null)
      this.renderer.setScissorTest(false)
      this.renderer.setViewport(0, 0, this.outputWidth, this.outputHeight)
      this.renderer.render(scene, camera)
      return
    }

    const sideBySide = this.settings.mode === 'sbs' || this.settings.mode === 'crossview'
    const eyeWidth = sideBySide ? Math.max(1, Math.floor(this.outputWidth / 2)) : this.outputWidth
    const eyeAspect = eyeWidth / Math.max(1, this.outputHeight)
    camera.updateMatrixWorld()
    const basePosition = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld)
    const baseRotation = new THREE.Quaternion().setFromRotationMatrix(camera.matrixWorld)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(baseRotation).normalize()
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(baseRotation).normalize()
    const convergenceTarget = basePosition.clone().addScaledVector(forward, this.settings.convergence)
    const halfSeparation = this.settings.separation * 0.5

    this.copyEyeCamera(camera, this.leftCamera, basePosition.clone().addScaledVector(right, -halfSeparation), convergenceTarget, eyeAspect)
    this.copyEyeCamera(camera, this.rightCamera, basePosition.clone().addScaledVector(right, halfSeparation), convergenceTarget, eyeAspect)

    this.renderer.setScissorTest(false)
    this.renderer.setRenderTarget(this.leftTarget)
    this.renderer.setViewport(0, 0, eyeWidth, this.outputHeight)
    this.renderer.clear()
    this.renderer.render(scene, this.leftCamera)
    this.renderer.setRenderTarget(this.rightTarget)
    this.renderer.setViewport(0, 0, eyeWidth, this.outputHeight)
    this.renderer.clear()
    this.renderer.render(scene, this.rightCamera)

    this.renderer.setRenderTarget(null)
    this.renderer.setViewport(0, 0, this.outputWidth, this.outputHeight)
    this.renderer.render(this.compositeScene, this.compositeCamera)
  }

  dispose() {
    this.leftTarget.dispose()
    this.rightTarget.dispose()
    this.compositeQuad.geometry.dispose()
    this.compositeMaterial.dispose()
  }

  private copyEyeCamera(source: THREE.PerspectiveCamera, target: THREE.PerspectiveCamera, position: THREE.Vector3, lookAt: THREE.Vector3, aspect: number) {
    target.copy(source)
    target.position.copy(position)
    target.up.copy(source.up)
    target.aspect = aspect
    target.lookAt(lookAt)
    target.updateProjectionMatrix()
  }
}
