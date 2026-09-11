import * as THREE from 'three'
import { originalGeometry, SCALE } from './original-data.ts'
import type { OriginalDocument } from './original-data.ts'

// Balls.nmo Ball_LightningSphere 437: Show sphere, spin it at 2 PI/s while
// cycling textures 1-2-3, grow 0-1 over 1500 ms, ramp its point light blue
// over 2500 ms, then a 60-particle smoke burst with a white flash while the
// lightning keeps running underneath. Rotate ends at 3000 ms and hides the
// sphere; Gameplay New Ball physicalizes the player at the same 3000 ms.
// Material 185 blends ONE,ONE (Virtools/D3D9) with black diffuse, white
// emissive, no Z-write, front faces.
export const SPAWN_SCALE_MS = 1500
export const SPAWN_FLASH_MS = 2500
export const SPAWN_DURATION = 3
const SPHERE_TEXTURES = ['Ball_LightningSphere1', 'Ball_LightningSphere2', 'Ball_LightningSphere3'].map(name => `/original/textures/${name}.png`)
const SMOKE_COUNT = 60
const SMOKE_CLUSTERS = 7
const smokeClusterDir = (cluster: number) => {
  const t = (cluster + .5) / SMOKE_CLUSTERS, phi = Math.acos(1 - 2 * t), theta = Math.PI * (1 + Math.sqrt(5)) * cluster
  return new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta))
}

export class OriginalSpawnEffect {
  group = new THREE.Group()
  age = 0
  active = false
  unveiled = false
  private sphere?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhongMaterial[]>
  private body?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  private arcs?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  private flash?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  private light = new THREE.PointLight(0x3a5bff, 0, 20 * SCALE, 2)
  private textures: THREE.Texture[] = []
  private smoke?: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
  private smokeVelocities = new Float32Array(SMOKE_COUNT * 3)
  private smokeAge = 0
  private flashed = false
  constructor(document: OriginalDocument, materials: Map<number, THREE.MeshPhongMaterial>) {
    const object = document.objects.find(o => o.name === 'Ball_LightningSphere')
    const source = object && document.meshes.find(m => m.id === object.mesh)
    if (source) {
      const fallback = materials.values().next().value!
      const sphere = new THREE.Mesh(originalGeometry(source, object!.matrix, true), source.materials.map(id => materials.get(id) || fallback))
      sphere.frustumCulled = false
      sphere.visible = false
      this.sphere = sphere
      this.group.add(sphere)
      const packMap = sphere.material.find(m => m.name === 'Ball_LightningSphere')?.map ?? null
      const arcs = new THREE.Mesh(sphere.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, map: packMap, transparent: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor, depthWrite: false, side: THREE.FrontSide }))
      arcs.frustumCulled = false
      arcs.renderOrder = 2
      arcs.visible = packMap !== null
      this.arcs = arcs
      this.group.add(arcs)
      const body = new THREE.Mesh(sphere.geometry, new THREE.MeshBasicMaterial({ color: 0x0a1a66, transparent: true, opacity: .45, depthWrite: false }))
      body.scale.setScalar(.97)
      body.frustumCulled = false
      body.renderOrder = 1
      this.body = body
      this.group.add(body)
      const flash = new THREE.Mesh(sphere.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))
      flash.frustumCulled = false
      flash.renderOrder = 3
      flash.visible = false
      this.flash = flash
      this.group.add(flash)
    }
    this.light.visible = false
    this.group.add(this.light)
    this.group.visible = false
  }
  async load() {
    const loader = new THREE.TextureLoader()
    const safe = async (file: string): Promise<THREE.Texture | undefined> => {
      try {
        const texture = await loader.loadAsync(file)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.generateMipmaps = false
        return texture
      } catch {
        return undefined
      }
    }
    this.textures = (await Promise.all(SPHERE_TEXTURES.map(safe))).filter((t): t is THREE.Texture => t !== undefined)
    if (!this.textures.length) this.textures = [this.makeArcsTexture(), this.makeArcsTexture(), this.makeArcsTexture()]
    if (this.arcs && this.textures.length) {
      this.arcs.material.map = this.textures[0]!
      this.arcs.material.needsUpdate = true
      this.arcs.visible = true
    }
    const smoke = await safe('/original/textures/Particle_Smoke.png')
    if (!smoke) return
    const positions = new Float32Array(SMOKE_COUNT * 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
    this.smoke = new THREE.Points(geometry, new THREE.PointsMaterial({ map: smoke, size: .5, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }))
    this.smoke.frustumCulled = false
    this.smoke.visible = false
    this.group.add(this.smoke)
  }
  private makeArcsTexture() {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, 256, 256)
    const bolt = (width: number, glow: string) => {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = width
      ctx.shadowColor = glow
      ctx.shadowBlur = 10
      ctx.beginPath()
      let x = Math.random() * 256, y = -10
      ctx.moveTo(x, y)
      for (let i = 0; i < 9; i++) {
        x += (Math.random() - .5) * 44
        y += 256 / 8
        ctx.lineTo(x, y)
        if (Math.random() < .3) {
          ctx.moveTo(x, y)
          ctx.lineTo(x + (Math.random() - .5) * 60, y + 20)
          ctx.moveTo(x, y)
        }
      }
      ctx.stroke()
    }
    for (let i = 0; i < 14; i++) bolt(2, '#4488ff')
    for (let i = 0; i < 6; i++) bolt(1, '#99ccff')
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    return texture
  }
  begin(position: THREE.Vector3) {
    this.age = 0
    this.active = true
    this.unveiled = false
    this.flashed = false
    this.smokeAge = 0
    this.group.position.copy(position)
    this.group.visible = true
    if (this.arcs) {
      this.arcs.visible = this.arcs.material.map !== null
      this.arcs.material.opacity = 1
    }
    if (this.body) this.body.material.opacity = .45
    if (this.flash) this.flash.visible = false
    if (this.smoke) this.smoke.visible = false
    this.light.visible = true
    this.update(0)
  }
  update(dt: number) {
    if (!this.active) return
    this.age += dt
    const ageMs = this.age * 1000
    if (this.sphere) {
      const growth = Math.min(1, ageMs / SPAWN_SCALE_MS)
      const flicker = 1 + .08 * Math.sin(this.age * 40)
      this.sphere.scale.setScalar(Math.max(.001, (1 - (1 - growth) ** 3) * flicker))
      this.sphere.rotation.y += dt * Math.PI * 2
      if (this.body) this.body.scale.copy(this.sphere.scale).multiplyScalar(.97)
      if (this.arcs?.visible) {
        this.arcs.scale.copy(this.sphere.scale)
        this.arcs.rotation.y = this.sphere.rotation.y
        if (this.textures.length) this.arcs.material.map = this.textures[Math.floor(this.age / .08) % this.textures.length]!
      }
    }
    if (!this.flashed) {
      const blue = Math.min(1, ageMs / SPAWN_FLASH_MS)
      this.light.intensity = 5 * blue
      this.light.color.setHex(0x3a5bff).lerp(new THREE.Color(0xffffff), blue * blue)
      if (ageMs >= SPAWN_FLASH_MS) {
        this.flashed = true
        this.unveiled = true
        if (this.flash) {
          this.flash.visible = true
          this.flash.scale.setScalar(1)
          this.flash.material.opacity = 1
        }
        if (this.smoke) {
          const positions = this.smoke.geometry.getAttribute('position')
          for (let i = 0; i < SMOKE_COUNT; i++) {
            const cluster = i % SMOKE_CLUSTERS
            const dir = smokeClusterDir(cluster)
            const speed = 2 + (cluster % 3) * .8 + Math.random() * .9
            this.smokeVelocities.set([dir.x * speed + (Math.random() - .5) * .7, Math.abs(dir.y) * speed + 1.2 + Math.random() * .5, dir.z * speed + (Math.random() - .5) * .7], i * 3)
            positions.setXYZ(i, 0, 0, 0)
          }
          positions.needsUpdate = true
          this.smoke.visible = true
          this.smoke.material.opacity = .9
          this.smoke.material.size = .5
        }
        this.light.intensity = 14
        this.light.color.setHex(0xffffff)
      }
    } else {
      const since = ageMs - SPAWN_FLASH_MS
      const bloom = Math.min(1, since / 150)
      const fade = Math.min(1, since / 450)
      if (this.body) this.body.material.opacity = .45 * (1 - fade)
      if (this.flash) {
        this.flash.scale.setScalar(1 + (1 - (1 - bloom) ** 3) * 2)
        this.flash.material.opacity = 1 - fade
        if (fade >= 1) this.flash.visible = false
      }
      if (this.smoke?.visible) {
        this.smokeAge += dt
        const drag = (1 - Math.exp(-3 * this.smokeAge)) / 3
        const positions = this.smoke.geometry.getAttribute('position')
        for (let i = 0; i < SMOKE_COUNT; i++) {
          const cluster = i % SMOKE_CLUSTERS
          const wobble = Math.sin(this.smokeAge * 6 + cluster) * .15 * this.smokeAge
          positions.setXYZ(i, this.smokeVelocities[i * 3]! * drag + wobble, this.smokeVelocities[i * 3 + 1]! * drag + this.smokeAge * .4, this.smokeVelocities[i * 3 + 2]! * drag - wobble)
        }
        positions.needsUpdate = true
        this.smoke.material.opacity = .9 * (1 - fade)
        this.smoke.material.size = .5 + bloom * 2
        if (fade >= 1) this.smoke.visible = false
      }
      this.light.intensity = 14 * (1 - fade)
      if (fade >= 1) this.light.visible = false
    }
    if (this.age >= SPAWN_DURATION) this.end()
  }
  end() {
    this.active = false
    this.age = 0
    this.group.visible = false
    this.group.scale.setScalar(1)
    if (this.sphere) { this.sphere.scale.setScalar(1); this.sphere.rotation.set(0, 0, 0) }
    if (this.arcs) { this.arcs.visible = this.arcs.material.map !== null; this.arcs.material.opacity = 1; this.arcs.scale.setScalar(1); this.arcs.rotation.set(0, 0, 0) }
    if (this.body) this.body.scale.setScalar(.97)
    if (this.flash) this.flash.visible = false
    if (this.smoke) this.smoke.visible = false
    this.light.visible = false
    this.light.intensity = 0
  }
  dispose() {
    this.arcs?.material.dispose()
    this.body?.material.dispose()
    this.sphere?.geometry.dispose()
    this.flash?.material.dispose()
    this.smoke?.geometry.dispose()
    this.smoke?.material.dispose()
    this.smoke?.material.map?.dispose()
    this.textures.forEach(t => t.dispose())
  }
}
