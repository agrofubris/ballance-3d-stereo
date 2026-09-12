import type { HarnessScenario } from './types.ts'

const BRIDGE_START_ORIGINAL: [number, number, number] = [Number('707.7859497070312'), Number('-12.287001991271973'), Number('-873.7407857895529')]
const CROWN_START_ORIGINAL: [number, number, number] = [Number('707.7859497070312'), Number('-11.6569'), Number('-873.7407857895529')]
const BRIDGE_START_YAW = -Math.PI / 2
const CHECKPOINT_4_RESET_ORIGINAL: [number, number, number] = [Number('341.9595031738281'), Number('-4.072678089141846'), Number('-830.5913696289062')]

export const HARNESS_SCENARIOS: HarnessScenario[] = [
  {
    id: 'stage1_spawn',
    level: 0,
    start: { kind: 'spawn' },
    maxTicks: 460,
    input: [],
    compare: {
      poseTolerance: 1e-3,
      supportPersistence: 3,
    },
    assertions: [
      { kind: 'event', event: 'spawn.begin', from: 0, to: 2, note: 'the real spawn presentation begins at load' },
      { kind: 'field', path: 'lifecycle.physicalized', op: 'eq', value: false, from: 0, to: 320, note: 'ball stays nonphysical through the unveil' },
      { kind: 'event', event: 'spawn.unveil', from: 328, to: 333, note: 'SPAWN_FLASH_MS=2500 at 132 Hz' },
      { kind: 'event', event: 'ball.physicalized', from: 394, to: 399, note: 'SPAWN_DURATION=3000 at 132 Hz' },
      { kind: 'field', path: 'lifecycle.physicalized', op: 'eq', value: true, from: 399, to: 459 },
    ],
  },
  {
    id: 'stage1_stone_crown',
    level: 0,
    start: {
      kind: 'inject',
      sector: 4,
      material: 'stone',
      positionOriginal: CROWN_START_ORIGINAL,
      yaw: BRIDGE_START_YAW,
    },
    maxTicks: 900,
    input: [
      { from: 0, to: 40, forward: 0, lateral: 0 },
      { from: 40, to: 900, forward: 1, lateral: 0 },
    ],
    compare: {
      startTick: 40,
      endTick: 899,
      poseTolerance: 1e-3,
      longitudinalPositionTolerance: 1e-2,
      longitudinalVelocityTolerance: 5e-2,
      supportPersistence: 3,
      knownGap: {
        classification: 'known-manifold-gap',
        firstContactWindow: [60, 180],
        firstLateralWindow: [120, 260],
        firstPoseWindow: [40, 60],
        note: 'Rapier resolves the centered crown placement as a balanced pair; IVP seeds a -Z tilted contact and the deterministic lateral walk. The staged pose sits on the authored deck surface and 40 zero-input ticks settle the placement before the +X drive.',
      },
    },
    assertions: [],
  },
  {
    id: 'stage1_wood_finish',
    level: 0,
    start: {
      kind: 'inject',
      sector: 4,
      material: 'wood',
      positionOriginal: BRIDGE_START_ORIGINAL,
      yaw: BRIDGE_START_YAW,
    },
    maxTicks: 2200,
    stopOnComplete: true,
    input: [{ from: 0, to: 2200, forward: 1, lateral: 0 }],
    actions: [],
    compare: {
      poseTolerance: 1e-3,
    },
    assertions: [
      { kind: 'event', event: 'finish.wake', from: 0, to: 60, note: 'approach proximity wakes the managed finish assembly' },
      { kind: 'event', event: 'finish.boarding', from: 100, to: 700, note: 'recovered wood boarding window' },
      { kind: 'event', event: 'finish.departure.begin', from: 100, to: 700 },
      { kind: 'event', event: 'level.complete', from: 1800, to: 2199 },
      { kind: 'field', path: 'lifecycle.platformColliders', op: 'eq', value: 6, from: { event: 'finish.boarding', offset: 0 }, to: { event: 'finish.boarding', offset: 10 }, note: 'the six-hull platform proxy is live while boarding' },
      { kind: 'field', path: 'contacts.supportIds', op: 'someMatch', value: 'pe_balloon.Platform', from: { event: 'finish.boarding', offset: 0 }, to: { event: 'finish.departure.end', offset: 0 }, note: 'the managed platform supports the ball during the ride' },
      { kind: 'field', path: 'lifecycle.stalePlatformSupport', op: 'eq', value: false, note: 'no support collider remains at the original platform location' },
      { kind: 'field', path: 'contacts.supportIds', op: 'noneMatch', value: 'Ballon|Seil', note: 'balloons and ropes are never support colliders' },
      { kind: 'field', path: 'contacts.supportIds', op: 'noneMatch', value: 'Box_slide', note: 'Box_slide stays a control-only body' },
      { kind: 'field', path: 'lifecycle.finishParts', op: 'equalAtTicks', ticks: [1, { event: 'finish.boarding', offset: 0 }, { event: 'finish.departure.end', offset: 0 }], note: 'managed finish bodies are neither duplicated nor leaked' },
      { kind: 'field', path: 'lifecycle.finishModules', op: 'equalAtTicks', ticks: [1, { event: 'finish.boarding', offset: 0 }, { event: 'finish.departure.end', offset: 0 }] },
      { kind: 'field', path: 'lifecycle.platformDistanceFromOrigin', op: 'gte', value: 5, from: { event: 'finish.departure.end', offset: 0 }, to: { event: 'finish.departure.end', offset: 0 }, note: 'the platform has left its origin when the ending completes' },
    ],
  },
  {
    id: 'stage1_finish_reset',
    level: 0,
    start: {
      kind: 'inject',
      sector: 4,
      material: 'wood',
      positionOriginal: BRIDGE_START_ORIGINAL,
      yaw: BRIDGE_START_YAW,
    },
    maxTicks: 900,
    input: [{ from: 0, to: 900, forward: 1, lateral: 0 }],
    actions: [{ kind: 'reset', afterEvent: 'finish.wake', delayTicks: 120, note: 'real respawn path resets the active sector after the managed bodies wake' }],
    compare: {
      poseTolerance: 1e-3,
    },
    assertions: [
      { kind: 'event', event: 'finish.wake', from: 0, to: 60 },
      { kind: 'field', path: 'lifecycle.finishPhase', op: 'eq', value: 'dormant', from: { event: 'finish.wake', offset: 125 }, to: { event: 'finish.wake', offset: 145 }, note: 'finish state restored after reset' },
      { kind: 'field', path: 'lifecycle.finishParts', op: 'equalAtTicks', ticks: [1, { event: 'finish.wake', offset: 130 }], note: 'managed bodies restored without duplicates' },
      { kind: 'field', path: 'lifecycle.finishModules', op: 'equalAtTicks', ticks: [1, { event: 'finish.wake', offset: 130 }] },
      { kind: 'field', path: 'lifecycle.platformDistanceFromOrigin', op: 'lt', value: 0.01, from: { event: 'finish.wake', offset: 125 }, to: { event: 'finish.wake', offset: 145 }, note: 'departing-platform state cleared' },
      { kind: 'field', path: 'lifecycle.physicalized', op: 'eq', value: true, from: { event: 'finish.wake', offset: 125 }, to: { event: 'finish.wake', offset: 145 } },
      { kind: 'field', path: 'lifecycle.checkpoint', op: 'eq', value: 3, from: { event: 'finish.wake', offset: 125 }, to: { event: 'finish.wake', offset: 145 } },
      { kind: 'field', path: 'contacts.supportIds', op: 'noneMatch', value: 'PE_Balloon', from: { event: 'finish.wake', offset: 125 }, to: { event: 'finish.wake', offset: 145 }, note: 'no ghost finish support after reset' },
      { kind: 'field', path: 'ball.position[0]', op: 'approx', value: CHECKPOINT_4_RESET_ORIGINAL[0] * 0.25, tolerance: 5e-3, from: { event: 'finish.wake', offset: 121 }, to: { event: 'finish.wake', offset: 122 } },
      { kind: 'field', path: 'ball.position[1]', op: 'approx', value: CHECKPOINT_4_RESET_ORIGINAL[1] * 0.25, tolerance: 5e-3, from: { event: 'finish.wake', offset: 121 }, to: { event: 'finish.wake', offset: 122 } },
      { kind: 'field', path: 'ball.position[2]', op: 'approx', value: -CHECKPOINT_4_RESET_ORIGINAL[2] * 0.25, tolerance: 5e-3, from: { event: 'finish.wake', offset: 121 }, to: { event: 'finish.wake', offset: 122 } },
    ],
  },
]

export function harnessScenario(id: string) {
  return HARNESS_SCENARIOS.find(scenario => scenario.id === id)
}
