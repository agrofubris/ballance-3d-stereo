import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import recovered from './original-finish-data.json' with { type: 'json' }
import { OriginalProximity } from './original-proximity.ts'
import { originalGeometry, SCALE } from './original-data.ts'
import type { OriginalDocument, OriginalObject } from './original-data.ts'
import { originalCollisionGroups } from './original-collisions.ts'
import { configureBody, configureContact, ORIGINAL_TIME_FACTOR, ORIGINAL_PSI_HZ } from './original-physics.ts'
import { springImpulse } from './original-spring.ts'

type FinishPart = { name: string; mesh: THREE.Mesh; body: RAPIER.RigidBody; origin: THREE.Vector3; sector: number; fixed: boolean }
type Force = { body: RAPIER.RigidBody; offset: THREE.Vector3 | null; world: THREE.Vector3; dir: THREE.Vector3; impulse: number }

/** Rapier PE_Balloon assembly. Managed lifecycle mirrors OriginalIvpFinish:
 * recovered rigid-body state is authoritative (entry plates are dynamic parts
 * that start frozen), the wake releases the whole connected island like the
 * native cluster wake, and the platform departs on boarding. Balloons/ropes/
 * slide are visual-only bodies. No solver settings change. */
export class OriginalFinish {
  name: string
  sector: number
  world: RAPIER.World
  parts: FinishPart[] = []
  meshes: THREE.Mesh[] = []
  joints = new Map<number, RAPIER.ImpulseJoint>()
  forces: Force[] = []
  stage: 'dormant' | 'ready' | 'departing' = 'dormant'
  active = false
  private fixed: RAPIER.RigidBody
  private parentMatrix: THREE.Matrix4
  private approach = new OriginalProximity(recovered.approach)
  private boarding = new OriginalProximity(recovered.boarding)
  private colliders: { collider: RAPIER.Collider; body: RAPIER.RigidBody; decorative: boolean }[] = []
  private spring: { bodyA: RAPIER.RigidBody; offA: THREE.Vector3; bodyB: RAPIER.RigidBody; offB: THREE.Vector3 } | undefined
  constructor(world: RAPIER.World, parent: OriginalObject, document: OriginalDocument, materials: Map<number, THREE.MeshPhongMaterial>, sector: number) {
    this.name = parent.name; this.sector = sector; this.world = world
    const parentMatrix = new THREE.Matrix4().fromArray(parent.matrix)
    this.parentMatrix = parentMatrix.clone()
    this.approach.remaining = recovered.approach.minFrameDelay
    this.fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...originalRenderPosition(parentMatrix).toArray()))
    for (const part of recovered.parts) {
      const object = document.objects.find(o => o.name === part.target)
      if (!object) throw new Error(`Missing finish part ${part.target}`)
      const matrix = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(object.matrix))
      const origin = originalRenderPosition(matrix)
      const source = document.meshes.find(m => m.id === object.mesh)!
      const mesh = new THREE.Mesh(originalGeometry(source, matrix.toArray(), true), source.materials.map(id => materials.get(id)!))
      mesh.name = object.name; mesh.position.copy(origin); mesh.castShadow = mesh.receiveShadow = true
      if (part.target === 'PE_Box_slide') mesh.visible = false
      else this.meshes.push(mesh)
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(origin.x, origin.y, origin.z).setCcdEnabled(true))
      // Recovered rigid-body state is authoritative; do not derive plate fixedness from the name.
      const fixed = part.fixed
      const hulls = part.target === 'PE_Balloon_Platform'
        ? ['PE_Balloon_Col_01_Mesh', 'PE_Balloon_Col_02_Mesh', 'PE_Balloon_Col_03_Mesh', 'PE_Balloon_Col_04_Mesh', 'PE_Balloon_Col_05_Mesh', 'PE_Balloon_Col_06_Mesh']
        : [source.name!]
      for (const hull of hulls) {
        const hullMesh = document.meshes.find(m => m.name === hull)
        if (!hullMesh) throw new Error(`Missing finish collision hull ${hull}`)
        const geometry = originalGeometry(hullMesh, matrix.toArray(), true)
        const collider = world.createCollider(configureContact(RAPIER.ColliderDesc.convexHull(geometry.attributes.position!.array as Float32Array)!.setCollisionGroups(part.enableCollision ? originalCollisionGroups(part.collisionGroup) : 0).setMass(part.mass), part), body)
        geometry.dispose()
        this.colliders.push({ collider, body, decorative: !part.enableCollision })
      }
      configureBody(body, part)
      body.recomputeMassPropertiesFromColliders()
      this.parts.push({ name: object.name, mesh, body, origin, sector, fixed })
    }
    const springFrame1 = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(recovered.spring.frame1))
    const springFrame2 = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(recovered.spring.frame2))
    const platformOrigin = this.part('PE_Balloon_Platform').origin
    const slideOrigin = this.part('PE_Box_slide').origin
    const anchorA = new THREE.Vector3(...recovered.spring.position1 as [number, number, number]).applyMatrix4(springFrame1).multiplyScalar(SCALE)
    anchorA.z *= -1
    const anchorB = new THREE.Vector3(...recovered.spring.position2 as [number, number, number]).applyMatrix4(springFrame2).multiplyScalar(SCALE)
    anchorB.z *= -1
    this.spring = {
      bodyA: this.part('PE_Balloon_Platform').body,
      offA: anchorA.sub(platformOrigin),
      bodyB: this.part('PE_Box_slide').body,
      offB: anchorB.sub(slideOrigin),
    }
    this.reset()
  }
  private part(name: string) {
    const part = this.parts.find(p => p.name === name)
    if (!part) throw new Error(`Missing finish part ${name}`)
    return part
  }
  get position() { return new THREE.Vector3().copy(this.part('PE_Balloon_Platform').body.translation()) }
  enabledColliderCount() { return this.colliders.filter(c => !c.decorative && c.body.isEnabled() && c.collider.isEnabled()).length }
  private installForce(f: { target: string; position: readonly number[]; positionFrameName: string; positionFrame: readonly number[]; direction: readonly number[]; directionFrame: readonly number[]; impulse: number }) {
    const core = f.positionFrameName === f.target
    const frame = this.parentMatrix.clone().multiply(new THREE.Matrix4().fromArray([...f.positionFrame]))
    const dir = new THREE.Vector3(...f.direction as [number, number, number]).transformDirection(new THREE.Matrix4().fromArray([...f.directionFrame]))
    dir.z *= -1
    const impulse = f.impulse * SCALE * ORIGINAL_TIME_FACTOR ** 2 * ORIGINAL_PSI_HZ
    if (core) {
      const offset = new THREE.Vector3(...f.position as [number, number, number]).multiplyScalar(SCALE)
      offset.z *= -1
      this.forces.push({ body: this.part(f.target).body, offset, world: new THREE.Vector3(), dir, impulse })
    } else {
      const world = new THREE.Vector3(...f.position as [number, number, number]).applyMatrix4(frame).multiplyScalar(SCALE)
      world.z *= -1
      this.forces.push({ body: this.part(f.target).body, offset: null, world, dir, impulse })
    }
  }
  private createJoints() {
    for (const joint of recovered.hinges) {
      const a = this.part(joint.target).body
      const b = joint.anchorObject === 'FixCube Object' ? this.fixed : this.part(joint.anchorObject).body
      const matrix = this.parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(joint.frame))
      const pivot = originalRenderPosition(matrix)
      const axis = new THREE.Vector3(0, 0, 1).transformDirection(matrix)
      axis.z *= -1
      const revolute = this.world.createImpulseJoint(
        RAPIER.JointData.revolute(pivot.clone().sub(a.translation()), pivot.clone().sub(b.translation()), axis), a, b, false) as RAPIER.RevoluteImpulseJoint
      if (joint.limitsEnabled) revolute.setLimits(joint.lowerLimit, joint.upperLimit)
      this.joints.set(joint.index, revolute)
    }
    for (const slider of recovered.sliders) {
      const a = this.part(slider.target).body
      const b = slider.anchorObject === 'FixCube Object' ? this.fixed : this.part(slider.anchorObject).body
      const anchor = originalRenderPosition(this.parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(slider.frame1)))
      const other = originalRenderPosition(this.parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(slider.frame2)))
      const axis = other.clone().sub(anchor).normalize()
      const prismatic = this.world.createImpulseJoint(
        RAPIER.JointData.prismatic(anchor.clone().sub(a.translation()), anchor.clone().sub(b.translation()), axis), a, b, false) as RAPIER.PrismaticImpulseJoint
      if (slider.limitsEnabled) prismatic.setLimits(slider.lowerLimit * SCALE, slider.upperLimit * SCALE)
      this.joints.set(slider.index, prismatic)
    }
  }
  setActive(active: boolean) {
    if (this.active === active) return
    if (!active) { this.reset(); return }
    this.active = true
    for (const part of this.parts) part.body.setEnabled(true)
    this.createJoints()
  }
  update(player: THREE.Vector3, activeSector: number) {
    this.setActive(this.sector === activeSector)
    if (!this.active) return false
    const platform = new THREE.Vector3().copy(this.part('PE_Balloon_Platform').body.translation())
    if (this.stage === 'dormant') {
      if (!this.approach.enter(player, platform)) return false
      for (const part of this.parts) if (!part.fixed) part.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
      this.part('PE_Balloon_Platform').body.wakeUp()
      for (const force of recovered.forces) this.installForce(force)
      this.stage = 'ready'
    }
    if (this.stage === 'ready' && this.boarding.enter(player, platform)) {
      this.installForce(recovered.departureForce)
      const joint = this.joints.get(recovered.releaseHinge)
      if (joint) { this.world.removeImpulseJoint(joint, true); this.joints.delete(recovered.releaseHinge) }
      for (const part of this.parts) if (!part.fixed) { part.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); part.body.wakeUp() }
      this.stage = 'departing'
      return true
    }
    return false
  }
  step(dt: number) {
    if (!this.active || dt <= 0) return
    for (const force of this.forces) {
      const point = force.offset ? force.offset.clone().applyQuaternion(force.body.rotation()).add(force.body.translation()) : force.world
      force.body.applyImpulseAtPoint(force.dir.clone().multiplyScalar(force.impulse * dt), point, true)
    }
    if (this.spring) {
      const { bodyA, offA, bodyB, offB } = this.spring
      const pointA = offA.clone().applyQuaternion(bodyA.rotation()).add(bodyA.translation())
      const pointB = offB.clone().applyQuaternion(bodyB.rotation()).add(bodyB.translation())
      const relative = new THREE.Vector3().copy(bodyA.velocityAtPoint(pointA)).sub(bodyB.velocityAtPoint(pointB))
      const impulse = springImpulse(pointA.clone().sub(pointB), relative, { ...recovered.spring, length: recovered.spring.length * SCALE }, dt)
      bodyA.applyImpulseAtPoint(impulse, pointA, true)
      bodyB.applyImpulseAtPoint(impulse.clone().negate(), pointB, true)
    }
  }
  reset() {
    for (const joint of this.joints.values()) this.world.removeImpulseJoint(joint, false)
    this.joints.clear()
    this.forces = []
    for (const part of this.parts) {
      part.body.setEnabled(false)
      part.body.setTranslation(part.origin, false); part.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false)
      part.body.setLinvel({ x: 0, y: 0, z: 0 }, false); part.body.setAngvel({ x: 0, y: 0, z: 0 }, false)
      part.body.setBodyType(RAPIER.RigidBodyType.Fixed, false)
    }
    this.stage = 'dormant'; this.active = false
    this.approach = new OriginalProximity(recovered.approach)
    this.approach.remaining = recovered.approach.minFrameDelay
    this.boarding = new OriginalProximity(recovered.boarding)
  }
  dispose() {
    for (const joint of this.joints.values()) this.world.removeImpulseJoint(joint, false)
    this.joints.clear()
    for (const part of this.parts) this.world.removeRigidBody(part.body)
    this.parts = []; this.meshes = []; this.forces = []; this.colliders = []
  }
}

function originalRenderPosition(matrix: THREE.Matrix4) {
  const position = new THREE.Vector3().setFromMatrixPosition(matrix).multiplyScalar(SCALE)
  position.z *= -1
  return position
}
