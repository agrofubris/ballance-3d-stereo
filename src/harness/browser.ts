import { harnessScenario } from './scenarios.ts'
import { runHarnessScenario } from './runner.ts'

const params = new URLSearchParams(location.search)
const scenarioId = params.get('scenario') ?? ''
const solver = params.get('solver') === 'ivp' ? 'ivp' as const : 'rapier' as const
const run = Number(params.get('run') ?? '1')
const detail = params.get('detail') === '1'
const next = params.get('next')

async function post(payload: unknown) {
  await fetch('/__harness/result', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
}

async function main() {
  const scenario = harnessScenario(scenarioId)
  if (!scenario) throw new Error(`Unknown harness scenario: ${scenarioId}`)
  const { OriginalEngine } = await import('../game/original-engine.ts')
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:0;top:0;width:64px;height:48px;overflow:hidden;pointer-events:none'
  document.body.append(host)
  const engine = new OriginalEngine(host, () => undefined, solver === 'ivp')
  await engine.initialize()
  engine.setSettings({ sound: false, quality: false, sensitivity: 1 })
  engine.audio.paused = true
  engine.audio.sync()
  const result = await runHarnessScenario(engine, scenario, solver, detail)
  await post({ status: 'ok', scenario: scenario.id, solver, run, meta: result.meta, jsonl: result.rows.map(row => JSON.stringify(row)).join('\n') })
  try { engine.destroy() } catch { /* the result is already posted */ }
  if (next) location.assign(next)
}

main().catch(async error => {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined
  try { await post({ status: 'error', scenario: scenarioId, solver, run, error: message, stack }) } catch { /* the CLI timeout reports the missing result */ }
})
