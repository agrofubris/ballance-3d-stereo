import * as THREE from 'three'
import { originalGeometry } from './original-data'
import type { OriginalDocument } from './original-data'
import skyData from './original-sky-data.json'

/**
 * Recovered from Levelinit.nmo AllLevel: each level names its sky set
 * (`Sky` column) and the five texture faces loaded by `Load Sky-Textures`.
 */
export const originalSkyLetter = (index: number): string => {
  const entry = skyData.levels.find(level => level.level === index + 1)
  if (!entry) throw new Error(`No recovered sky mapping for level ${index + 1}`)
  return entry.letter
}

/**
 * The authored `SkyLayer` entity of the current level: a textured cloud
 * surface the level scripts show when the `Clouds?` option (`Skylayer ein?`,
 * DB_Options row 0 column 10) is on and scroll with the level's AllLevel
 * `Skytranslation` vector (texture units per second), channel -1.
 */
export class OriginalSkyLayer {
  readonly group = new THREE.Group()
  private readonly layer: THREE.Mesh
  private readonly materials: THREE.MeshPhongMaterial[] = []
  private readonly maps: THREE.Texture[] = []
  private readonly scroll: THREE.Vector2
  private readonly fadeFrom: THREE.Color
  private readonly fadeTo: THREE.Color
  private gate = true

  constructor(document: OriginalDocument, materials: Map<number, THREE.MeshPhongMaterial>, index: number) {
    const entry = skyData.levels.find(level => level.level === index + 1)
    if (!entry) throw new Error(`No recovered sky data for level ${index + 1}`)
    this.scroll = new THREE.Vector2(entry.scroll[0], entry.scroll[1])
    const prelit = skyData.layer.prelit
    const fadeTo = skyData.layer.fadeTo
    this.fadeFrom = new THREE.Color(prelit[0], prelit[1], prelit[2])
    this.fadeTo = new THREE.Color(fadeTo[0], fadeTo[1], fadeTo[2])
    const object = document.objects.find(candidate => candidate.name === skyData.layer.name)
    const source = object && document.meshes.find(mesh => mesh.id === object.mesh)
    if (!object || !source?.indices.length) throw new Error(`Level document has no ${skyData.layer.name} mesh`)
    const layerMaterials = source.materials.map(id => {
      const base = materials.get(id)
      if (!base) return base
      const material = base.clone()
      // init SkyLayer (Levelinit.nmo): entity color filter 200/255, source and
      // destination blend ONE/ONE, texture blend MODULATE, Z buffer write off.
      material.color.copy(this.fadeFrom)
      material.blending = THREE.CustomBlending
      material.blendEquation = THREE.AddEquation
      material.blendSrc = THREE.OneFactor
      material.blendDst = THREE.OneFactor
      material.blendEquationAlpha = THREE.AddEquation
      material.blendSrcAlpha = THREE.OneFactor
      material.blendDstAlpha = THREE.OneFactor
      material.transparent = true
      material.depthWrite = false
      material.needsUpdate = true
      this.materials.push(material)
      if (material.map && !this.maps.includes(material.map)) this.maps.push(material.map)
      return material
    }) as THREE.Material[]
    this.layer = new THREE.Mesh(originalGeometry(source, object.matrix), layerMaterials)
    this.layer.name = object.name
    this.layer.visible = this.gate
    this.group.add(this.layer)
  }

  /**
   * `animate SkyLayer` shows the layer only while `Skylayer ein?` holds. The
   * port has no options UI, so the shipped behavior (clouds on) applies.
   */
  setGate(on: boolean) {
    this.gate = on
    this.layer.visible = on
  }

  /** Texture Scroller applies `Skytranslation` per second to the mesh UVs. */
  step(dt: number) {
    if (!this.gate) return
    for (const map of this.maps) {
      map.offset.x = (map.offset.x + this.scroll.x * dt) % 1
      map.offset.y = (map.offset.y - this.scroll.y * dt) % 1
    }
  }

  /** `fadeout Sky`: prelit color 200/255 fades to black over 3000 ms. */
  setFade(t: number) {
    const color = this.fadeFrom.clone().lerp(this.fadeTo, Math.min(1, Math.max(0, t)))
    for (const material of this.materials) material.color.copy(color)
  }

  dispose() {
    this.materials.forEach(material => material.dispose())
    this.group.clear()
  }
}
