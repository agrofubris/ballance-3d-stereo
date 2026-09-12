import * as THREE from 'three'
import type { OriginalEngine } from '../game/original-engine.ts'
import { createObserver } from './observer.ts'
import { HARNESS_TICK_SECONDS } from './types.ts'
import type { HarnessEventName, HarnessInputState, HarnessRunResult, HarnessScenario, HarnessSolver, HarnessTickRecord } from './types.ts'

const ZERO_INPUT: HarnessInputState = { forward: 0, lateral: 0, brake: false }

export function originalToRender(position: readonly [number, number, number]) {
  return new THREE.Vector3(position[0] * 0.25, position[1] * 0.25, -position[2] * 0.25)
}

function inputAt(scenario: HarnessScenario, tick: number): HarnessInputState {
  for (let i = scenario.input.length - 1; i >= 0; i--) {
    const segment = scenario.input[i]!
    if (tick >= segment.from && tick < segment.to) {
      return { forward: segment.forward ?? 0, lateral: segment.lateral ?? 0, brake: segment.brake ?? false }
    }
  }
  return { ...ZERO_INPUT }
}

function applyInput(engine: OriginalEngine, input: HarnessInputState) {
  engine.keys.clear()
  engine.touch = { x: input.lateral, z: -input.forward, brake: input.brake }
}

function deriveEvents(previous: HarnessTickRecord, current: HarnessTickRecord): HarnessEventName[] {
  const events: HarnessEventName[] = []
  const p = previous.lifecycle, c = current.lifecycle
  if (!p.spawnActive && c.spawnActive) events.push('spawn.begin')
  if (!p.spawnUnveiled && c.spawnUnveiled) events.push('spawn.unveil')
  if (!p.physicalized && c.physicalized) events.push('ball.physicalized')
  if (c.checkpoint > p.checkpoint) events.push('checkpoint.enter', 'sector.activate')
  if (p.finishPhase === 'dormant' && c.finishPhase === 'ready') events.push('finish.wake')
  if (p.finishPhase !== 'departing' && c.finishPhase === 'departing') events.push('finish.boarding')
  if (!p.ending && c.ending) events.push('finish.departure.begin')
  if (p.phase !== 'won' && c.phase === 'won') events.push('finish.departure.end', 'level.complete')
  if (p.respawnStage === 'idle' && c.respawnStage !== 'idle') events.push('ball.dead')
  return events
}

export async function runHarnessScenario(engine: OriginalEngine, scenario: HarnessScenario, solver: HarnessSolver, detail: boolean): Promise<HarnessRunResult> {
  const observer = createObserver(engine, solver)
  observer.setDetail(detail || scenario.sample?.contacts === true)
  const notes: string[] = []
  let baseline: HarnessTickRecord
  if (scenario.start.kind === 'spawn') {
    observer.reset()
    baseline = observer.sample(-1, ZERO_INPUT)
    await engine.load(scenario.level)
  } else {
    await engine.load(scenario.level)
    const start = scenario.start
    engine.stagePlayer(originalToRender(start.positionOriginal), start.sector, start.material, {
      rotation: start.rotation ? new THREE.Quaternion(...start.rotation) : undefined,
      yaw: start.yaw,
      linearVelocity: start.linearVelocity ? new THREE.Vector3(...start.linearVelocity) : undefined,
      angularVelocity: start.angularVelocity ? new THREE.Vector3(...start.angularVelocity) : undefined,
    })
    observer.reset()
    baseline = observer.sample(-1, ZERO_INPUT)
    if (solver === 'ivp' && (start.linearVelocity || start.angularVelocity)) notes.push('IVP backend ignores velocity injection; the scenario must stage from rest')
  }
  cancelAnimationFrame(engine.frame)
  engine.state.phase = 'paused'
  engine.audio.paused = true
  engine.audio.sync()
  const rows: HarnessTickRecord[] = []
  const eventTicks = new Map<HarnessEventName, number>()
  const fired = new Set<NonNullable<HarnessScenario['actions']>[number]>()
  let previous = baseline
  const dt = HARNESS_TICK_SECONDS
  const loopStarted = performance.now()
  for (let tick = 0; tick < scenario.maxTicks; tick++) {
    const input = inputAt(scenario, tick)
    applyInput(engine, input)
    if (engine.native) engine.stepEndingVisuals(dt)
    engine.step(dt)
    const record = observer.sample(tick, input)
    if (tick === 5 && (detail || scenario.sample?.contacts === true)) notes.push(...observer.diagnostics())
    record.scenario = scenario.id
    record.events = deriveEvents(previous, record)
    for (const event of record.events) if (!eventTicks.has(event)) eventTicks.set(event, tick)
    rows.push(record)
    previous = record
    for (const action of scenario.actions ?? []) {
      if (fired.has(action)) continue
      const after = eventTicks.get(action.afterEvent)
      if (after === undefined || tick < after + action.delayTicks) continue
      fired.add(action)
      if (action.kind === 'reset') {
        engine.respawn()
        notes.push(`reset action fired at tick ${tick} (${action.afterEvent}+${action.delayTicks})`)
      }
    }
    if (scenario.stopOnComplete !== false && (record.lifecycle.phase === 'won' || record.lifecycle.phase === 'lost')) break
  }
  return {
    scenario: scenario.id,
    solver,
    meta: {
      scenario: scenario.id,
      solver,
      level: scenario.level,
      ticks: rows.length,
      startTick: 0,
      simMs: performance.now() - loopStarted,
      contacts: detail || scenario.sample?.contacts === true,
      capabilities: observer.capabilities,
      notes,
    },
    rows,
  }
}
