import type { HarnessScenario } from './types.ts'

const BRIDGE_START_ORIGINAL: [number, number, number] = [Number('707.7859497070312'), Number('-12.287001991271973'), Number('-873.7407857895529')]
const CROWN_START_ORIGINAL: [number, number, number] = [Number('707.7859497070312'), Number('-11.6569'), Number('-873.7407857895529')]
const BRIDGE_START_YAW = -Math.PI / 2
const CHECKPOINT_4_RESET_ORIGINAL: [number, number, number] = [Number('341.9595031738281'), Number('-4.072678089141846'), Number('-830.5913696289062')]
// Authored PE_Balloon_Platform origin in level 1, plus the ball's stable
// platform-local rest offset during the native departing ride (both measured
// from the recovered authored assembly and the IVP ride trace). Staging there
// puts the rider on the supported platform before any simulation tick.
const PLATFORM_ORIGIN_ORIGINAL: [number, number, number] = [Number('731.785949707'), Number('-13.387001991'), Number('-873.740783691')]
const PLATFORM_RIDE_OFFSET_ORIGINAL: [number, number, number] = [Number('-0.7239567358778913'), Number('0.10878013170499834'), Number('0.4518316494368264')]
const PLATFORM_RIDE_START_ORIGINAL: [number, number, number] = PLATFORM_ORIGIN_ORIGINAL.map((value, axis) => value + PLATFORM_RIDE_OFFSET_ORIGINAL[axis]!) as [number, number, number]

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
      { kind: 'event', event: 'level.complete', from: 1800, to: 2199, solver: 'ivp', note: 'the native ride completes; the Rapier ball can fall from the departing platform (known ride gap) where the authored death volume now correctly ends the run' },
      { kind: 'field', path: 'lifecycle.platformColliders', op: 'eq', value: 6, from: { event: 'finish.boarding', offset: 0 }, to: { event: 'finish.boarding', offset: 10 }, note: 'the six-hull platform proxy is live while boarding' },
      { kind: 'field', path: 'contacts.supportIds', op: 'someMatch', value: 'pe_balloon.Platform', from: { event: 'finish.boarding', offset: 0 }, to: { event: 'finish.boarding', offset: 120 }, note: 'the managed platform supports the ball during the ride' },
      { kind: 'field', path: 'lifecycle.stalePlatformSupport', op: 'eq', value: false, note: 'no support collider remains at the original platform location' },
      { kind: 'field', path: 'contacts.supportIds', op: 'noneMatch', value: 'Ballon|Seil', note: 'balloons and ropes are never support colliders' },
      { kind: 'field', path: 'contacts.supportIds', op: 'noneMatch', value: 'Box_slide', note: 'Box_slide stays a control-only body' },
      { kind: 'field', path: 'lifecycle.finishParts', op: 'equalAtTicks', ticks: [1, { event: 'finish.boarding', offset: 0 }, { event: 'finish.boarding', offset: 120 }], note: 'managed finish bodies are neither duplicated nor leaked during the ride' },
      { kind: 'field', path: 'lifecycle.finishModules', op: 'equalAtTicks', ticks: [1, { event: 'finish.boarding', offset: 0 }, { event: 'finish.boarding', offset: 120 }] },
      { kind: 'field', path: 'lifecycle.platformDistanceFromOrigin', op: 'gte', value: 5, from: { event: 'finish.departure.end', offset: 0 }, to: { event: 'finish.departure.end', offset: 0 }, solver: 'ivp', note: 'the platform has left its origin when the ending completes' },
    ],
  },
  {
    id: 'stage1_transform_respawn',
    level: 0,
    start: {
      kind: 'inject',
      sector: 2,
      material: 'wood',
      positionOriginal: [Number('147.2'), Number('-2.75'), Number('-540')],
      yaw: BRIDGE_START_YAW,
    },
    maxTicks: 1400,
    input: [
      { from: 0, to: 40, forward: 0, lateral: 0 },
      { from: 40, to: 700, forward: 0, lateral: -1 },
      { from: 700, to: 1400, forward: 0, lateral: 0 },
    ],
    compare: { poseTolerance: 1e-3 },
    assertions: [
      { kind: 'event', event: 'transform.capture', from: 125, to: 140, note: 'recovered capture entry, cooldown-gated' },
      { kind: 'event', event: 'transform.explode', from: 438, to: 452 },
      { kind: 'event', event: 'transform.material.change', from: 455, to: 470 },
      { kind: 'event', event: 'transform.release', from: 455, to: 470 },
      { kind: 'field', path: 'ball.type', op: 'eq', value: 'stone', from: 462, to: 560, note: 'new material survives the departure and fall' },
      { kind: 'field', path: 'ball.type', op: 'eq', value: 'wood', from: 900, to: 1399, note: 'respawn restores the checkpoint material' },
      { kind: 'field', path: 'lifecycle.lives', op: 'eq', value: 3, from: 0, to: 640 },
      { kind: 'field', path: 'lifecycle.colliderEnabled', op: 'eq', value: false, from: 200, to: 440, note: 'capture disables player collision' },
      { kind: 'field', path: 'lifecycle.colliderEnabled', op: 'eq', value: true, from: 470, to: 700, note: 'release restores player collision' },
      { kind: 'event', event: 'ball.dead', from: 635, to: 660, note: 'authored DepthTestCubes death volume' },
      { kind: 'event', event: 'respawn.complete', from: 1170, to: 1195 },
      { kind: 'field', path: 'lifecycle.lives', op: 'eq', value: 2, from: 1195, to: 1399 },
      { kind: 'field', path: 'lifecycle.checkpoint', op: 'eq', value: 1, from: 900, to: 1399 },
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
  {
    id: 'stage1_finish_ride',
    level: 0,
    start: {
      kind: 'inject',
      sector: 4,
      material: 'wood',
      positionOriginal: PLATFORM_RIDE_START_ORIGINAL,
      yaw: BRIDGE_START_YAW,
    },
    maxTicks: 1900,
    stopOnComplete: true,
    input: [],
    compare: {
      startTick: 9,
      poseTolerance: 1e-3,
      knownGap: {
        classification: 'known-finish-constraint-solver-gap',
        note: 'IVP 1k10 resolves local constraints as one-shot per-PSI controllers and applies gravity/spring/actuator async pushes during integration, after constraint correction; the stacked recovered 639+659 mechanism therefore retains a bounded off-axis error under relative load, while Rapier iterates the loaded joint island and keeps locked DOFs closer to exact. Both solvers survive and complete. The per-solver platform Y bounds express this accepted solver-model gap; no empirical softness or force rescaling is applied.',
      },
    },
    assertions: [
      { kind: 'event', event: 'finish.wake', from: 0, to: 30, note: 'the staged supported rider trips the recovered approach proximity immediately' },
      { kind: 'event', event: 'finish.boarding', from: 0, to: 30, note: 'boarding fires from the supported platform-local state' },
      { kind: 'event', event: 'finish.departure.begin', from: 0, to: 30, note: 'the recovered departure force launches the assembly' },
      { kind: 'phase', phase: 'departing', from: { event: 'finish.boarding', offset: 2 }, to: { event: 'finish.boarding', offset: 120 }, note: 'the assembly stays in the departing stage through the ride' },
      { kind: 'field', path: 'lifecycle.ending', op: 'eq', value: true, from: { event: 'finish.boarding', offset: 2 }, to: { event: 'finish.boarding', offset: 120 }, note: 'the ending presentation owns the ride on both backends' },
      { kind: 'eventAbsent', event: 'ball.dead', note: 'the rider must survive the whole departing ride on both solvers' },
      { kind: 'event', event: 'level.complete', from: 1500, to: 1899, note: 'the recovered ending presentation completes on both backends' },
      { kind: 'field', path: 'contacts.grounded', op: 'eq', value: true, from: { event: 'finish.boarding', offset: 60 }, to: { event: 'finish.boarding', offset: 160 }, note: 'persistent support during the early ride' },
      { kind: 'field', path: 'contacts.supportIds', op: 'someMatch', value: 'pe_balloon.Platform', from: { event: 'finish.boarding', offset: 60 }, to: { event: 'finish.boarding', offset: 160 }, note: 'the early ride support is the managed platform' },
      { kind: 'field', path: 'contacts.grounded', op: 'eq', value: true, from: { event: 'finish.boarding', offset: 700 }, to: { event: 'finish.boarding', offset: 800 }, note: 'persistent support late in the ride' },
      { kind: 'field', path: 'contacts.supportIds', op: 'someMatch', value: 'pe_balloon.Platform', from: { event: 'finish.boarding', offset: 700 }, to: { event: 'finish.boarding', offset: 800 } },
      { kind: 'field', path: 'contacts.supportIds', op: 'noneMatch', value: 'Ballon|Seil|Box_slide', note: 'balloons, ropes, and the slide stay control-only' },
      { kind: 'field', path: 'lifecycle.platformDistanceFromOrigin', op: 'gte', value: 2, from: { event: 'finish.boarding', offset: 700 }, to: { event: 'finish.boarding', offset: 800 }, note: 'the platform has left its origin mid-ride' },
      { kind: 'field', path: 'lifecycle.platformLinearVelocity[0]', op: 'gt', value: 0.1, from: { event: 'finish.boarding', offset: 700 }, to: { event: 'finish.boarding', offset: 800 }, note: 'the platform moves after wake/departure' },
      { kind: 'field', path: 'lifecycle.platformPosition[1]', op: 'gte', value: -4.5, from: { event: 'finish.wake', offset: 0 }, to: { event: 'level.complete', offset: 0 }, solver: 'ivp', note: 'native platform vertical motion stays inside the recovered IVP sag/lift envelope' },
      { kind: 'field', path: 'lifecycle.platformPosition[1]', op: 'gte', value: -4.6, from: { event: 'finish.wake', offset: 0 }, to: { event: 'level.complete', offset: 0 }, solver: 'rapier', note: 'known bounded solver-model fidelity gap: the globally iterative Rapier joint island reaches a deeper departure sag than IVP one-shot local constraints (observed minimum approx -4.50); a materially deeper sag fails here, and this is not native parity' },
      { kind: 'field', path: 'lifecycle.platformPosition[1]', op: 'lte', value: -2.4, from: { event: 'finish.wake', offset: 0 }, to: { event: 'level.complete', offset: 0 } },
      { kind: 'field', path: 'lifecycle.finishParts', op: 'equalAtTicks', ticks: [1, { event: 'finish.boarding', offset: 0 }, { event: 'finish.boarding', offset: 120 }], note: 'managed finish bodies are neither duplicated nor leaked during the ride' },
    ],
  },
]

export function harnessScenario(id: string) {
  return HARNESS_SCENARIOS.find(scenario => scenario.id === id)
}
