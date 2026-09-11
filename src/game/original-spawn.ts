import * as THREE from 'three'
import { originalGeometry, SCALE } from './original-data.ts'
import type { OriginalDocument } from './original-data.ts'

// Balls.nmo Ball_LightningSphere 437: Show sphere, spin it at 2 PI/s while
// cycling textures 1-2-3, grow 0-1 over 1500 ms, ramp its point light blue
// over 2500 ms, then a 60-particle smoke burst with a white flash. Gameplay
// New Ball physicalizes the player at 3000 ms, which ends the hold.
export const SPAWN_SCALE_MS = 1500
export const SPAWN_FLASH_MS = 2500
export const SPAWN_DURATION = 3
const SPHERE_TEXTURES = ['Ball_LightningSphere1', 'Ball_LightningSphere2', 'Ball_LightningSphere3'].map(name => `/original/textures/${name}.png`)
const SMOKE_COUNT = 60
const SMOKE_LIFETIME = 1

export class OriginalSpawnEffect {
  group = new THREE.Group()
  age = 0
  active = false
  unveiled = false
  private sphere?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhongMaterial[]>
  private lightning?: THREE.MeshPhongMaterial
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
      for (const material of sphere.material) {
        if (material.name !== 'Ball_LightningSphere') continue
        this.lightning = material
        material.blending = THREE.AdditiveBlending
        material.depthWrite = false
        material.transparent = true
      }
      this.sphere = sphere
      this.group.add(sphere)
      const flash = new THREE.Mesh(sphere.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))
      flash.frustumCulled = false
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
    this.textures = await Promise.all(SPHERE_TEXTURES.map(async file => {
      const texture = await loader.loadAsync(file)
      texture.colorSpace = THREE.SRGBColorSpace
      return texture
    }))
    const smoke = await loader.loadAsync('/original/textures/Particle_Smoke.png')
    smoke.colorSpace = THREE.SRGBColorSpace
    const positions = new Float32Array(SMOKE_COUNT * 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
    this.smoke = new THREE.Points(geometry, new THREE.PointsMaterial({ map: smoke, size: .5, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }))
    this.smoke.frustumCulled = false
    this.smoke.visible = false
    this.group.add(this.smoke)
  }
  begin(position: THREE.Vector3) {
    this.age = 0
    this.active = true
    this.unveiled = false
    this.flashed = false
    this.smokeAge = 0
    this.group.position.copy(position)
    this.group.visible = true
    if (this.sphere) this.sphere.visible = true
    if (this.flash) this.flash.visible = false
    if (this.smoke) this.smoke.visible = false
    this.light.visible = true
    this.update(0)
  }
  update(dt: number) {
    if (!this.active) return
    this.age += dt
    const ageMs = this.age * 1000
    if (this.sphere?.visible) {
      const growth = Math.min(1, ageMs / SPAWN_SCALE_MS)
      const flicker = 1 + .08 * Math.sin(this.age * 40)
      this.sphere.scale.setScalar(Math.max(.001, (1 - (1 - growth) ** 3) * flicker))
      this.sphere.rotation.y += dt * Math.PI * 2
      if (this.textures.length && this.lightning) {
        const texture = this.textures[Math.floor(this.age / .08) % this.textures.length]!
        this.lightning.map = texture
        this.lightning.emissiveMap = texture
      }
    }
    if (!this.flashed) {
      const blue = Math.min(1, ageMs / SPAWN_FLASH_MS)
      this.light.intensity = 25 * blue
      this.light.color.setHex(0x3a5bff).lerp(new THREE.Color(0xffffff), blue * blue)
      if (ageMs >= SPAWN_FLASH_MS) {
        this.flashed = true
        this.unveiled = true
        if (this.sphere) this.sphere.visible = false
        if (this.flash) {
          this.flash.visible = true
          this.flash.scale.setScalar(1)
          this.flash.material.opacity = 1
        }
        if (this.smoke) {
          const positions = this.smoke.geometry.getAttribute('position')
          for (let i = 0; i < SMOKE_COUNT; i++) {
            const theta = Math.random() * Math.PI * 2, phi = Math.acos(2 * Math.random() - 1), speed = 1 + Math.random() * 2
            this.smokeVelocities.set([Math.sin(phi) * Math.cos(theta) * speed, Math.abs(Math.cos(phi)) * speed, Math.sin(phi) * Math.sin(theta) * speed], i * 3)
            positions.setXYZ(i, 0, 0, 0)
          }
          positions.needsUpdate = true
          this.smoke.visible = true
          this.smoke.material.opacity = .8
          this.smoke.material.size = .5
        }
        this.light.intensity = 60
        this.light.color.setHex(0xffffff)
      }
    } else {
      const fade = Math.min(1, (ageMs - SPAWN_FLASH_MS) / 600)
      if (this.flash) {
        this.flash.scale.setScalar(1 + fade * 1.5)
        this.flash.material.opacity = 1 - fade
        if (fade >= 1) this.flash.visible = false
      }
      if (this.smoke?.visible) {
        this.smokeAge += dt
        const positions = this.smoke.geometry.getAttribute('position')
        for (let i = 0; i < SMOKE_COUNT; i++) positions.setXYZ(i, this.smokeVelocities[i * 3]! * this.smokeAge, this.smokeVelocities[i * 3 + 1]! * this.smokeAge, this.smokeVelocities[i * 3 + 2]! * this.smokeAge)
        positions.needsUpdate = true
        this.smoke.material.opacity = .8 * (1 - this.smokeAge / SMOKE_LIFETIME)
        this.smoke.material.size = .5 + this.smokeAge * 1.5
        if (this.smokeAge >= SMOKE_LIFETIME) this.smoke.visible = false
      }
      this.light.intensity = 60 * (1 - fade)
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
    if (this.flash) this.flash.visible = false
    if (this.smoke) this.smoke.visible = false
    this.light.visible = false
    this.light.intensity = 0
    if (this.lightning) this.lightning.opacity = 1
  }
  dispose() {
    this.sphere?.geometry.dispose()
    this.flash?.material.dispose()
    this.smoke?.geometry.dispose()
    this.smoke?.material.dispose()
    this.smoke?.material.map?.dispose()
    this.textures.forEach(t => t.dispose())
  }
}
