#!/usr/bin/env node
// Anvil CLI entry — Node fallback. Prefers Bun via `bin/anvil` when available,
// otherwise runs the TypeScript source through tsx (dev) or dist/ (built).
const { existsSync } = require('node:fs')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')

const root = join(__dirname, '..')
const bunEntry = join(root, 'bin', 'anvil')
const distEntry = join(root, 'dist', 'index.js')

// If Bun is on PATH, prefer it for performance and to dogfood the primary runtime.
const hasBun = spawnSync('bun', ['--version'], { stdio: 'ignore' }).status === 0
if (hasBun && existsSync(bunEntry)) {
  const r = spawnSync('bun', [bunEntry, ...process.argv.slice(2)], {
    stdio: 'inherit',
  })
  process.exit(r.status ?? 1)
}

if (existsSync(distEntry)) {
  require(distEntry)
} else {
  const tsxPath = require.resolve('tsx/cli')
  const r = spawnSync(
    'node',
    [tsxPath, join(root, 'src', 'index.ts'), ...process.argv.slice(2)],
    {
      stdio: 'inherit',
    },
  )
  process.exit(r.status ?? 1)
}
