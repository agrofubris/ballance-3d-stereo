# Stage 1 dual-solver harness

The harness runs the same scripted gameplay input against the deployed Rapier
path and the native IVP runtime and records camera-independent traces. It exists
to find the first behavioral divergence between the two backends, not to render,
replay, or tune anything.

## 132 Hz tick semantics

Ballance simulates at 132 Hz (`ORIGINAL_PSI_HZ * ORIGINAL_TIME_FACTOR`).
`dt = 1/132` and every script/trace index is a physics tick. Browser and display
frame rates never schedule scripted input: the harness page cancels the game's
`requestAnimationFrame` loop and advances `engine.step(1/132)` in a synchronous
loop. The per-run `meta.simMs` field reports how long that tick loop actually
took. A 600-tick scenario is under 100 ms of simulation on the development
machine.

## Same script, both solvers

Scenarios are TypeScript definitions in `src/harness/scenarios.ts`
(`HarnessScenario`): level, start state, tick-bounded input segments, optional
tick-scheduled actions, assertions, and comparison tolerances.

- Input is state-based. Each tick the harness computes `{forward, lateral,
  brake}` and writes the engine's existing analog `touch` field plus an empty
  key set, so both backends consume the same real input abstraction.
- Starts are either the normal gameplay spawn (`kind: 'spawn'`) or explicit
  deterministic injection (`kind: 'inject'`) routed through the engine's
  backend-specific reset path (`OriginalEngine.stagePlayer`), leaving sector,
  checkpoint, finish lifecycle, and player physicalization in equivalent game
  state.
- No gameplay logic is duplicated. The harness drives and observes the real
  `OriginalEngine` and `OriginalIvpRuntime` paths.
- Settlement is explicit. Injected scenarios may open with a zero-input input
  segment; `compare.startTick` then starts the canonical cross-solver
  comparison after that interval, while the complete raw trace (including the
  settling ticks) is still written for diagnostics.

## What is compared

Each tick records ball pose/rotation/velocities, the intended input, lifecycle
state (sector, checkpoint, finish phase, spawn, respawn), contacts
(`grounded`, semantic support IDs, contact count), and explicit events
(`spawn.begin`, `spawn.unveil`, `ball.physicalized`, `checkpoint.enter`,
`sector.activate`, `finish.wake`, `finish.boarding`, `finish.departure.begin`,
`finish.departure.end`, `ball.dead`, `level.complete`). Camera state is never
recorded.

Comparison rules:

- Tolerances belong to scenarios. `poseTolerance` is in world/render units
  (0.25 x original model units); if a scenario does not declare one, the
  comparison reports exact-equality semantics instead of inventing a default.
  `longitudinalPositionTolerance` and `longitudinalVelocityTolerance` use
  render units and render units/second.
- The canonical range is `[compare.startTick, canonicalEndTick]`. Raw traces are
  never truncated.
- Comparison stops at the first `ball.dead` in either trace; the comparison
  records `truncated` with the tick/event/solver so post-death teleports cannot
  contaminate trajectory maxima.
- Contact/support divergence requires `supportPersistence` consecutive differing
  ticks. A one-tick support flicker is reported separately as
  `firstSupportFlicker` and does not classify as a persistent divergence.
- Longitudinal parity covers the rolling lead-in before the first persistent
  contact-set or lateral divergence, not the static contact offset.
- Known-gap windows are reported independently for contact-set, lateral, and
  pose divergences; one satisfied or violated window never suppresses another
  result. Violations fail the run.
- Assertions are lifecycle/state checks evaluated per solver against the trace,
  with optional backend scoping for fields one backend truly cannot exercise.

## Known gap

- Stage 1 crowned bridge: the documented Rapier-vs-IVP contact-manifold
  difference. `stage1_stone_crown` stages the stone on the authored deck
  surface, settles for 40 zero-input ticks, then drives +X. The known-gap
  windows expect the first persistent contact-set divergence when the ball
  reaches the deck end/entry plates and the first lateral divergence shortly
  after, and only fail if those move outside the recorded windows.

## Commands

```sh
npm run harness -- --list
npm run harness -- stage1_stone_crown --solver rapier
npm run harness -- stage1_stone_crown --solver ivp
npm run harness -- stage1_stone_crown --solver both
npm run harness -- stage1_wood_finish --solver both --repeat 2
npm run harness -- stage1_stone_crown --solver both --contacts
```

`--repeat N` runs the scenario N times per solver. Determinism is only claimed
when at least two same-solver traces were compared; with `--repeat 1` the
summary reports `unassessed`. `--contacts` enables verbose per-contact
manifolds (world normal, point, separation, feature IDs; impulses where the
backend exposes them). `--out DIR` overrides the output root and `--timeout`
sets the seconds allowed for the whole browser batch.

Initial suite: `stage1_spawn`, `stage1_stone_crown`, `stage1_wood_finish`,
`stage1_finish_reset`.

## Output

Results are written under `.local/harness/<scenario>/<timestamp>/`
(`rapier.jsonl`, `ivp.jsonl`, optional `*.runN.jsonl`, `comparison.json`,
`assertions.json`, `summary.txt`). `.local/` is ignored; no generated trace is
part of the repository.

## Native IVP availability

Native execution needs the separately built local module at
`.local/ivp-simulation` (`python3 scripts/build-ivp-simulation.py`). If it is
absent, Rapier-only runs still work, `--solver both` runs Rapier and prints a
clean `SKIPPED` status for IVP, and the process exits successfully. No native
binary or original asset is bundled.

## Browser runner and process hygiene

The page entry `harness.html` is development-only and is not part of the
production build. The CLI starts Vite in-process (no server child process) and
launches `chrome-headless-shell` from `.tools/chrome-headless` or
`BALLANCE_CHROME`, headless, at a fixed 320x240 viewport with software WebGL.
Physics stays real; only rendering is minimal.

Cleanup runs in `finally` and on SIGINT/SIGTERM: the browser process tree is
terminated by PID with `taskkill /T`, its temporary profile directory under
`%TEMP%` is removed with retries, the in-process dev server is closed, and the
port is released. Ctrl+C therefore leaves no browser children or profile
directories behind. No screenshots, preview archives, or converted assets are
created by the harness.

## Follow-ups (documented, not fixed here)

- `stagePlayer` does not reset `padCooldown`; a staged scenario next to a
  transformation pad could transform on the first tick.
- `engine.colliderNames` is populated at collider creation and may be stale
  after collider replacement.
- Entry-plate managed-vs-foreign support identity is coarser than the platform
  identity; a future pass could tag each finish part body explicitly.
- The native player velocity convention (`world.state(...) * 0.5` with
  reflected Z) deserves a code comment next to `ivpRenderPosition`.
- Native `platformColliders` is reported from the recovered hull list rather
  than introspected from the IVP compound.
