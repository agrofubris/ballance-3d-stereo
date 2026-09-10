import * as THREE from 'three'
import { originalGeometry } from './original-data.ts'
import type { OriginalDocument } from './original-data.ts'
import respawnData from './original-respawn-data.json' with { type: 'json' }

export const SPAWN_DURATION = respawnData.physicalizeDelayMs / 1000

const SPHERE_TEXTURES = ['Ball_LightningSphere1', 'Ball_LightningSphere2', 'Ball_LightningSphere3'].map(name => `/original/textures/${name}.png`)

export class OriginalSpawnEffect {
  group = new THREE.Group()
  age = 0
  active = false
  private mesh?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhongMaterial[]>
  private lightning?: THREE.MeshPhongMaterial
  private textures: THREE.Texture[] = []
  constructor(document: OriginalDocument, materials: Map<number, THREE.MeshPhongMaterial>) {
    const object = document.objects.find(o => o.name === 'Ball_LightningSphere')
    const source = object && document.meshes.find(m => m.id === object.mesh)
    if (source) {
      const fallback = materials.values().next().value!
      const mesh = new THREE.Mesh(originalGeometry(source, object!.matrix, true), source.materials.map(id => materials.get(id) || fallback))
      mesh.frustumCulled = false
      for (const material of mesh.material) {
        if (material.name !== 'Ball_LightningSphere') continue
        this.lightning = material
        material.blending = THREE.AdditiveBlending
        material.depthWrite = false
        material.transparent = true
      }
      this.mesh = mesh
      this.group.add(mesh)
    }
    this.group.visible = false
  }
  async load() {
    this.textures = await Promise.all(SPHERE_TEXTURES.map(async file => {
      const texture = await new THREE.TextureLoader().loadAsync(file)
      texture.colorSpace = THREE.SRGBColorSpace
      return texture
    }))
  }
  begin(position: THREE.Vector3) {
    this.age = 0
    this.active = true
    this.group.position.copy(position)
    this.group.visible = true
    this.update(0)
  }
  update(dt: number) {
    if (!this.active) return
    this.age += dt
    const progress = Math.min(1, this.age / SPAWN_DURATION)
    if (this.textures.length && this.lightning) {
      const texture = this.textures[Math.floor(this.age / .12) % this.textures.length]!
      this.lightning.map = texture
      this.lightning.emissiveMap = texture
    }
    const ramp = Math.min(1, this.age / .3)
    const flicker = 1 + .12 * Math.sin(this.age * 25) * (1 - progress)
    this.group.scale.setScalar(Math.max(.001, ramp * flicker))
    this.group.rotation.y += dt * 3
    if (this.lightning) this.lightning.opacity = progress > .8 ? 1 - (progress - .8) / .2 : 1
    if (progress >= 1) this.end()
  }
  end() {
    this.active = false
    this.age = 0
    this.group.visible = false
    this.group.scale.setScalar(1)
    if (this.lightning) this.lightning.opacity = 1
  }
  dispose() {
    this.mesh?.geometry.dispose()
    this.textures.forEach(t => t.dispose())
  }
}
