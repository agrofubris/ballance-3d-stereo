import type { Material } from '../game/levels.ts'

export type HarnessSolver = 'rapier' | 'ivp'

export const HARNESS_TICK_SECONDS = 1 / 132

export interface HarnessInputState {
  forward: number
  lateral: number
  brake: boolean
}

export interface HarnessInputSegment {
  from: number
  to: number
  forward?: number
  lateral?: number
  brake?: boolean
}

export type HarnessStart =
  | { kind: 'spawn' }
  | {
      kind: 'inject'
      sector: number
      material: Material
      positionOriginal: [number, number, number]
      rotation?: [number, number, number, number]
      yaw?: number
      linearVelocity?: [number, number, number]
      angularVelocity?: [number, number, number]
    }

export interface HarnessScenario {
  id: string
  level: number
  start: HarnessStart
  maxTicks: number
  stopOnComplete?: boolean
  input: HarnessInputSegment[]
  actions?: HarnessScenarioAction[]
  assertions?: HarnessAssertion[]
  sample?: {
    contacts?: boolean
    everyTicks?: number
  }
  compare?: {
    startTick?: number
    endTick?: number
    poseTolerance?: number
    longitudinalPositionTolerance?: number
    longitudinalVelocityTolerance?: number
    supportPersistence?: number
    knownGap?: {
      classification: string
      firstContactWindow?: [number, number]
      firstLateralWindow?: [number, number]
      firstPoseWindow?: [number, number]
      note?: string
    }
  }
}

export interface HarnessResetAction {
  kind: 'reset'
  afterEvent: HarnessEventName
  delayTicks: number
  note?: string
}

export type HarnessScenarioAction = HarnessResetAction

export type HarnessEventName =
  | 'spawn.begin'
  | 'spawn.unveil'
  | 'ball.physicalized'
  | 'checkpoint.enter'
  | 'sector.activate'
  | 'transform.capture'
  | 'transform.explode'
  | 'transform.material.change'
  | 'transform.release'
  | 'ball.dead'
  | 'respawn.begin'
  | 'respawn.complete'
  | 'finish.wake'
  | 'finish.boarding'
  | 'finish.departure.begin'
  | 'finish.departure.end'
  | 'level.complete'

export type HarnessFinishPhase = 'none' | 'dormant' | 'ready' | 'departing'

export interface HarnessBallSample {
  position: [number, number, number]
  rotation: [number, number, number, number]
  linearVelocity: [number, number, number]
  angularVelocity: [number, number, number]
  type: Material
}

export interface HarnessTransformationSample {
  active: boolean
  age: number
  target: string
  committed: boolean
  shattered: boolean
}

export interface HarnessLifecycleSample {
  phase: string
  activeSector: number
  checkpoint: number
  lives: number
  physicalized: boolean
  colliderEnabled: boolean
  transformation: HarnessTransformationSample | null
  spawnActive: boolean
  spawnUnveiled: boolean
  riding: boolean
  ending: boolean
  respawnStage: string
  finishPhase: HarnessFinishPhase
  finishActive: boolean
  finishParts: number
  finishModules: number
  platformPosition: [number, number, number] | null
  platformDistanceFromOrigin: number | null
  stalePlatformSupport: boolean
  platformColliders: number | null
  backendBodies: number
}

export interface HarnessContactPoint {
  id: string
  normal: [number, number, number]
  point: [number, number, number] | null
  separation: number | null
  normalImpulse: number | null
  tangentImpulse: [number, number] | null
  feature1: number | null
  feature2: number | null
}

export interface HarnessContactSample {
  grounded: boolean
  supportIds: string[]
  contactCount: number
  contacts?: HarnessContactPoint[]
}

export interface HarnessTickRecord {
  scenario: string
  solver: HarnessSolver
  tick: number
  simTime: number
  ball: HarnessBallSample
  input: HarnessInputState
  lifecycle: HarnessLifecycleSample
  contacts: HarnessContactSample
  events: HarnessEventName[]
}

export interface HarnessRunMeta {
  scenario: string
  solver: HarnessSolver
  level: number
  ticks: number
  startTick: number
  simMs: number
  contacts: boolean
  capabilities: HarnessCapabilities
  notes: string[]
}

export interface HarnessCapabilities {
  velocityInjection: boolean
  contactManifoldDetail: boolean
  supportIdentity: boolean
  backendBodyCount: boolean
}

export interface HarnessRunResult {
  scenario: string
  solver: HarnessSolver
  meta: HarnessRunMeta
  rows: HarnessTickRecord[]
}

export type HarnessComparisonOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'approx'
  | 'someMatch'
  | 'noneMatch'
  | 'equalAtTicks'

export interface HarnessEventRange {
  event: HarnessEventName
  offset?: number
}

export type HarnessRange = number | HarnessEventRange

export interface HarnessAssertion {
  kind: 'event' | 'eventAbsent' | 'phase' | 'field'
  path?: string
  event?: HarnessEventName
  phase?: HarnessFinishPhase
  op?: HarnessComparisonOperator
  value?: number | string | boolean
  tolerance?: number
  solver?: HarnessSolver
  from?: HarnessRange
  to?: HarnessRange
  ticks?: HarnessRange[]
  note?: string
}

export interface HarnessAssertionResult {
  assertion: HarnessAssertion
  solver: HarnessSolver
  passed: boolean
  skipped?: boolean
  detail: string
}

export interface HarnessDivergence {
  tick: number
  positionDelta: [number, number, number] | null
  positionDistance: number | null
  velocityDelta: [number, number, number] | null
  angularVelocityDelta: [number, number, number] | null
  orientationDeltaAngle: number | null
  supportIds: [string, string] | null
  lifecycle: [HarnessFinishPhase, HarnessFinishPhase] | null
}

export interface HarnessEventTiming {
  event: HarnessEventName
  rapier: number | null
  ivp: number | null
  deltaTicks: number | null
}

export interface HarnessKnownGapWindow {
  window: [number, number] | null
  tick: number | null
  inside: boolean
}

export interface HarnessKnownGap {
  classification: string
  contact: HarnessKnownGapWindow
  lateral: HarnessKnownGapWindow
  pose: HarnessKnownGapWindow
  longitudinal: { applicable: boolean; passed: boolean; throughTick: number } | null
  violations: string[]
}

export interface HarnessComparison {
  scenario: string
  solvers: [HarnessSolver, HarnessSolver] | []
  ticks: { rapier: number; ivp: number }
  startTick: number
  endTick: number
  canonicalEndTick: number
  truncated: { tick: number; event: HarnessEventName; solver: HarnessSolver } | null
  poseTolerance: number
  poseToleranceNote: string
  supportPersistence: number
  firstPoseDivergence: HarnessDivergence | null
  firstLateralDivergence: HarnessDivergence | null
  firstSupportFlicker: HarnessDivergence | null
  firstSupportDivergence: HarnessDivergence | null
  firstLifecycleDivergence: HarnessDivergence | null
  firstEventDivergence: HarnessEventTiming | null
  maxPositionDistance: number
  maxAbsDelta: [number, number, number]
  maxAbsVelocityDelta: [number, number, number]
  maxAbsAngularVelocityDelta: [number, number, number]
  maxOrientationDeltaAngle: number
  longitudinalParity: {
    applicable: boolean
    reason: string | null
    throughTick: number
    maxAbsDeltaX: number
    maxAbsVelocityDeltaX: number
    positionTolerance: number
    velocityTolerance: number
    passed: boolean
  }
  eventTiming: HarnessEventTiming[]
  missingEvents: { rapier: HarnessEventName[]; ivp: HarnessEventName[] }
  knownGap: HarnessKnownGap | null
  unavailable: { rapier: string[]; ivp: string[] }
  determinism?: HarnessDeterminism[]
}

export interface HarnessDeterminism {
  solver: HarnessSolver
  runs: number
  assessed: boolean
  bitIdentical: boolean | null
  firstDifferenceTick: number | null
  firstDifferencePath: string | null
  maxPositionDistance: number | null
}
