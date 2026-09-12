import * as THREE from 'three'
import type { OriginalEngine } from '../game/original-engine.ts'
import finishData from '../game/original-finish-data.json' with { type: 'json' }
import type { HarnessCapabilities, HarnessContactPoint, HarnessContactSample, HarnessInputState, HarnessLifecycleSample, HarnessSolver, HarnessTickRecord } from './types.ts'

export function semanticId(name: string) {
  const leaf = name.slice(name.lastIndexOf('/') + 1)
  if (leaf.startsWith('PE_Balloon_')) return `pe_balloon.${leaf.slice('PE_Balloon_'.length)}`
  return leaf
}

export interface HarnessObserver {
  readonly solver: HarnessSolver
  readonly capabilities: HarnessCapabilities
  setDetail(detail: boolean): void
  reset(): void
  diagnostics(): string[]
  sample(tick: number, input: HarnessInputState): HarnessTickRecord
}

type FinishState = {
  phase: HarnessLifecycleSample['finishPhase']
  active: boolean
  parts: number
  modules: number
  platform: THREE.Vector3 | null
  platformRotation: [number, number, number, number] | null
  platformLinearVelocity: [number, number, number] | null
  platformAngularVelocity: [number, number, number] | null
  colliders: number | null
}

type ContactObservation = {
  sample: HarnessContactSample
  platformSupport: 'managed' | 'foreign' | null
}

abstract class BaseObserver implements HarnessObserver {
  protected engine: OriginalEngine
  protected detail = false
  private platformOrigin?: THREE.Vector3
  abstract readonly solver: HarnessSolver
  abstract readonly capabilities: HarnessCapabilities
  constructor(engine: OriginalEngine) {
    this.engine = engine
  }
  setDetail(detail: boolean) {
    this.detail = detail
  }
  diagnostics(): string[] {
    return []
  }
  reset() {
    this.platformOrigin = undefined
    const finish = this.finishState()
    if (finish.platform) this.platformOrigin = finish.platform.clone()
  }
  protected abstract finishState(): FinishState
  protected abstract contacts(): ContactObservation
  protected abstract angularVelocity(): [number, number, number]
  protected abstract backendBodies(): number
  protected abstract colliderEnabled(): boolean
  sample(tick: number, input: HarnessInputState): HarnessTickRecord {
    const engine = this.engine
    const body = engine.body
    const translation = body?.translation() ?? { x: 0, y: 0, z: 0 }
    const rotation = body?.rotation() ?? { x: 0, y: 0, z: 0, w: 1 }
    const linearVelocity = body?.linvel() ?? { x: 0, y: 0, z: 0 }
    const finish = this.finishState()
    const connection = this.contacts()
    const platformDistance = finish.platform && this.platformOrigin ? finish.platform.distanceTo(this.platformOrigin) : null
    const stale = connection.platformSupport === 'foreign'
    const transformation = engine.transformation
    const lifecycle: HarnessLifecycleSample = {
      phase: engine.state.phase,
      activeSector: engine.state.checkpoint + 1,
      checkpoint: engine.state.checkpoint,
      lives: engine.state.lives,
      physicalized: body?.isEnabled() ?? false,
      colliderEnabled: this.colliderEnabled(),
      transformation: transformation ? {
        active: transformation.active,
        age: transformation.age,
        target: transformation.kind,
        committed: transformation.committed,
        shattered: transformation.shattered,
      } : null,
      spawnActive: engine.spawnEffect?.active ?? false,
      spawnUnveiled: engine.spawnEffect?.unveiled ?? false,
      riding: engine.riding,
      ending: engine.endingAge !== undefined,
      respawnStage: engine.respawnSequence.stage,
      finishPhase: finish.phase,
      finishActive: finish.active,
      finishParts: finish.parts,
      finishModules: finish.modules,
      platformPosition: finish.platform ? finish.platform.toArray() as [number, number, number] : null,
      platformRotation: finish.platformRotation,
      platformLinearVelocity: finish.platformLinearVelocity,
      platformAngularVelocity: finish.platformAngularVelocity,
      platformDistanceFromOrigin: platformDistance,
      stalePlatformSupport: stale,
      platformColliders: finish.colliders,
      backendBodies: this.backendBodies(),
    }
    return {
      scenario: '',
      solver: this.solver,
      tick,
      simTime: tick / 132,
      ball: {
        position: [translation.x, translation.y, translation.z],
        rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
        linearVelocity: [linearVelocity.x, linearVelocity.y, linearVelocity.z],
        angularVelocity: this.angularVelocity(),
        type: engine.state.material,
      },
      input,
      lifecycle,
      contacts: connection.sample,
      events: [],
    }
  }
  protected platformSemanticId() {
    return 'pe_balloon.Platform'
  }
}

const emptyContacts = (): ContactObservation => ({ sample: { grounded: false, supportIds: [], contactCount: 0 }, platformSupport: null })

const emptyFinishState = (modules: number): FinishState => ({ phase: 'none', active: false, parts: 0, modules, platform: null, platformRotation: null, platformLinearVelocity: null, platformAngularVelocity: null, colliders: null })

export class RapierHarnessObserver extends BaseObserver {
  readonly solver = 'rapier' as const
  readonly capabilities: HarnessCapabilities = { velocityInjection: true, contactManifoldDetail: true, supportIdentity: true, backendBodyCount: true }
  private names = new Map<number, string>()
  private refreshNames() {
    const engine = this.engine
    this.names = new Map(engine.colliderNames)
    for (const item of engine.dynamics) {
      for (let i = 0; i < item.body.numColliders(); i++) this.names.set(item.body.collider(i).handle, item.mesh.name || 'dynamic')
    }
    for (const adapter of engine.finishAdapters) {
      for (const part of adapter.parts) {
        for (let i = 0; i < part.body.numColliders(); i++) this.names.set(part.body.collider(i).handle, part.name)
      }
    }
  }
  protected finishState(): FinishState {
    const engine = this.engine
    const adapter = engine.finishAdapters.find(item => item.sector === engine.state.checkpoint + 1)
    if (!adapter) return emptyFinishState(engine.finishAdapters.length)
    const platform = adapter.parts.find(part => part.name === 'PE_Balloon_Platform')
    if (!platform) return emptyFinishState(engine.finishAdapters.length)
    const rotation = platform.body.rotation()
    const linearVelocity = platform.body.linvel()
    const angularVelocity = platform.body.angvel()
    return {
      phase: adapter.stage,
      active: adapter.active,
      parts: adapter.parts.length,
      modules: engine.finishAdapters.length,
      platform: new THREE.Vector3().copy(platform.body.translation()),
      platformRotation: [rotation.x, rotation.y, rotation.z, rotation.w],
      platformLinearVelocity: [linearVelocity.x, linearVelocity.y, linearVelocity.z],
      platformAngularVelocity: [angularVelocity.x, angularVelocity.y, angularVelocity.z],
      colliders: platform.body.numColliders(),
    }
  }
  diagnostics(): string[] {
    const body = this.engine.body
    const world = this.engine.physics
    if (!body || !world) return ['rapier: no body or world']
    const collider = body.numColliders() ? body.collider(0) : null
    let pairs = 0, solver = 0, local = 0
    if (collider) world.contactPairsWith(collider, other => {
      pairs++
      world.contactPair(collider, other, manifold => { solver += manifold.numSolverContacts(); local += manifold.numContacts() })
    })
    return [`rapier: colliders=${body.numColliders()} pairs=${pairs} manifoldContacts=${local} solverContacts=${solver}`]
  }
  protected angularVelocity(): [number, number, number] {
    const value = this.engine.body?.angvel() ?? { x: 0, y: 0, z: 0 }
    return [value.x, value.y, value.z]
  }
  protected backendBodies(): number {
    return this.engine.physics?.bodies.len() ?? 0
  }
  protected colliderEnabled(): boolean {
    const body = this.engine.body
    return !!body && body.numColliders() > 0 && body.collider(0).isEnabled()
  }
  private platformColliderHandles() {
    const handles = new Set<number>()
    for (const adapter of this.engine.finishAdapters) {
      const platform = adapter.parts.find(part => part.name === 'PE_Balloon_Platform')
      if (!platform) continue
      for (let i = 0; i < platform.body.numColliders(); i++) handles.add(platform.body.collider(i).handle)
    }
    return handles
  }
  protected contacts(): ContactObservation {
    const engine = this.engine
    const body = engine.body
    const world = engine.physics
    if (!body || !world) return emptyContacts()
    const player = body.collider(0)
    if (!player) return emptyContacts()
    this.refreshNames()
    const observation = emptyContacts()
    const sample = observation.sample
    const platform = this.platformColliderHandles()
    const supports = new Set<string>()
    const details: HarnessContactPoint[] = []
    world.contactPairsWith(player, other => {
      world.contactPair(player, other, (manifold, flipped) => {
        const count = manifold.numContacts()
        sample.contactCount += count
        if (!count) return
        const name = this.names.get(other.handle) ?? `collider:${other.handle}`
        const id = semanticId(name)
        if (id === this.platformSemanticId()) observation.platformSupport = platform.has(other.handle) ? 'managed' : 'foreign'
        const raw = manifold.normal()
        const normal = flipped ? new THREE.Vector3(raw.x, raw.y, raw.z) : new THREE.Vector3(-raw.x, -raw.y, -raw.z)
        for (let i = 0; i < count; i++) {
          if (normal.y > 0.3) supports.add(id)
          if (!this.detail) continue
          const local = flipped ? manifold.localContactPoint1(i) : manifold.localContactPoint2(i)
          const point = local ? new THREE.Vector3(local.x, local.y, local.z).applyQuaternion(other.rotation()).add(other.translation()) : null
          details.push({
            id,
            normal: [normal.x, normal.y, normal.z],
            point: point ? [point.x, point.y, point.z] : null,
            separation: manifold.contactDist(i),
            normalImpulse: manifold.contactImpulse(i),
            tangentImpulse: [manifold.contactTangentImpulseX(i), manifold.contactTangentImpulseY(i)],
            feature1: manifold.contactFid1(i),
            feature2: manifold.contactFid2(i),
          })
        }
      })
    })
    sample.supportIds = [...supports].sort()
    sample.grounded = sample.supportIds.length > 0
    if (this.detail) sample.contacts = details
    return observation
  }
}

export class IvpHarnessObserver extends BaseObserver {
  readonly solver = 'ivp' as const
  readonly capabilities: HarnessCapabilities = { velocityInjection: false, contactManifoldDetail: false, supportIdentity: true, backendBodyCount: false }
  protected finishState(): FinishState {
    const engine = this.engine
    const finish = engine.native?.finish
    if (!finish) return emptyFinishState(0)
    const platform = finish.parts.get('PE_Balloon_Platform')
    const state = platform === undefined ? null : engine.native!.world.state(platform)
    const recovered = finishData.parts.find(part => part.target === 'PE_Balloon_Platform')
    const rotation = state ? new THREE.Quaternion(-state[3]!, -state[4]!, state[5]!, state[6]!) : null
    const linearVelocity = state ? [state[7]! * .5, state[8]! * .5, -state[9]! * .5] as [number, number, number] : null
    const angularVelocity = state ? [state[10]! * .5, state[11]! * .5, -state[12]! * .5] as [number, number, number] : null
    return {
      phase: finish.stage,
      active: true,
      parts: finish.parts.size,
      modules: 1,
      platform: state ? new THREE.Vector3(state[0]! * 0.25, state[1]! * 0.25, -state[2]! * 0.25) : null,
      platformRotation: rotation ? rotation.toArray() as [number, number, number, number] : null,
      platformLinearVelocity: linearVelocity,
      platformAngularVelocity: angularVelocity,
      colliders: platform === undefined ? null : recovered?.hulls?.length ?? 1,
    }
  }
  protected angularVelocity(): [number, number, number] {
    const engine = this.engine
    const player = engine.native?.player.body
    if (player === undefined || !engine.native) return [0, 0, 0]
    const state = engine.native.world.state(player)
    return [state[10]! * 0.5, state[11]! * 0.5, -state[12]! * 0.5]
  }
  protected backendBodies(): number {
    const runtime = this.engine.native
    if (!runtime) return 0
    return runtime.parts.length + (runtime.finish?.parts.size ?? 0)
  }
  protected colliderEnabled(): boolean {
    return this.engine.native?.player.body !== undefined
  }
  protected contacts(): ContactObservation {
    const runtime = this.engine.native
    const player = runtime?.player.body
    if (!runtime || player === undefined) return emptyContacts()
    const observation = emptyContacts()
    const sample = observation.sample
    const platform = runtime.finish?.parts.get('PE_Balloon_Platform')
    const supports = new Set<string>()
    const details: HarnessContactPoint[] = []
    for (const contact of runtime.world.contacts(player)) {
      sample.contactCount++
      const name = runtime.bodyNames.get(contact.other) ?? `body:${contact.other}`
      const id = semanticId(name)
      if (id === this.platformSemanticId()) observation.platformSupport = contact.other === platform ? 'managed' : 'foreign'
      const normal: [number, number, number] = [contact.normal[0], contact.normal[1], -contact.normal[2]]
      if (normal[1] > 0.3) supports.add(id)
      if (this.detail) details.push({ id, normal, point: null, separation: null, normalImpulse: contact.normalForce, tangentImpulse: null, feature1: null, feature2: null })
    }
    sample.supportIds = [...supports].sort()
    sample.grounded = sample.supportIds.length > 0
    if (this.detail) sample.contacts = details
    return observation
  }
}

export function createObserver(engine: OriginalEngine, solver: HarnessSolver): HarnessObserver {
  return solver === 'ivp' ? new IvpHarnessObserver(engine) : new RapierHarnessObserver(engine)
}
