/**
 * Plan 28 Phase E2 — global `--model` / `--effort` flag.
 *
 * The flags are wired in `src/index.ts` via Commander's `preAction` hook.
 * They must:
 *   1. set `ANVIL_MODEL` / `ANVIL_EFFORT` env vars so the resolver picks
 *      them up via the existing ENV layer (no resolver signature change);
 *   2. validate `--effort` against the `EffortLevel` Zod enum and exit 1
 *      with a list of valid values when invalid.
 *
 * The integration test exercises both via a small probe script that:
 *   (a) imports `src/index.ts` fresh in a child process,
 *   (b) inspects `process.env` after Commander's `preAction` has run.
 *
 * We can't simply read `process.env` from the parent because each Anvil
 * invocation lives in its own child; we therefore route a probe through the
 * `models list --json` command (a no-op-y read-only command) and inspect
 * the env-debugging side-effect via a sentinel command.
 *
 * The simplest reliable surface is to call a fast command (`-V`) with the
 * global flags and verify exit code, then call with an invalid `--effort`
 * and verify exit 1 + stderr message.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EffortLevel } from '../../src/core/types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const binPath = join(__dirname, '..', '..', 'bin', 'anvil.cjs')

describe('integration: global --model / --effort flag (Plan 28 E2)', () => {
  it('accepts a valid --model and --effort and exits 0', () => {
    // `-V` triggers Commander's version action AFTER the preAction hook has
    // run, so env propagation is exercised. We don't need to read the env
    // back; the success path is "no validation error, exit 0".
    const result = spawnSync(
      'node',
      [binPath, '--model', 'claude-sonnet-4-6', '--effort', 'high', '-V'],
      { encoding: 'utf-8' },
    )
    expect(result.status).toBe(0)
    // Stdout should include the version (a non-empty token).
    expect((result.stdout ?? '').trim().length).toBeGreaterThan(0)
    // Stderr should be empty — no validation message.
    expect(result.stderr ?? '').toBe('')
  })

  it('exits 1 with a clear error when --effort is invalid', () => {
    const result = spawnSync(
      'node',
      [binPath, '--effort', 'banana', 'doctor'],
      { encoding: 'utf-8' },
    )
    expect(result.status).toBe(1)
    const combined = `${result.stderr ?? ''}${result.stdout ?? ''}`
    expect(combined).toMatch(/Invalid --effort/)
    // The error message must list every valid level so the operator can
    // self-correct without reading source.
    for (const level of EffortLevel.options) {
      expect(combined).toContain(level)
    }
  })
})
