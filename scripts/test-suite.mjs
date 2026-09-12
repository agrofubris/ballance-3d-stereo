#!/usr/bin/env node
// Public test contract.
//
// The maintainer test suite lives in the local-only tests/ directory, which is
// intentionally not tracked. A clean public checkout therefore has no test
// files; npm test must say that instead of advertising an absent suite.
import { existsSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const tests = existsSync('tests') ? readdirSync('tests').filter(name => name.endsWith('.test.ts')) : []
if (tests.length === 0) {
  console.error('No test suite is shipped in this public source package.')
  console.error('The maintainer tests live in the local-only tests/ directory, which is intentionally not tracked.')
  console.error('Public verification for this repository is `npm run lint` and `npm run build`; see README.md.')
  process.exit(1)
}
const result = spawnSync(process.execPath, ['--test', ...tests.map(name => `tests/${name}`)], { stdio: 'inherit' })
process.exit(result.status ?? 1)
