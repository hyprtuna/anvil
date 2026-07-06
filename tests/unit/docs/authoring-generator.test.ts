/**
 * ANV-0010 + ANV-0018 — Generator no-op drift test.
 *
 * Asserts that running scripts/generate-authoring-md.ts --check on the
 * committed docs produces no diff. This guarantees that the committed
 * docs/hook-authoring.md and docs/skill-authoring.md are always in sync
 * with the generator output.
 *
 * If this test fails, run:
 *   bun run scripts/generate-authoring-md.ts
 * and commit the updated docs.
 */

import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '../../..')

describe('authoring-doc generator — regen-noop', () => {
  it('committed docs match generator output (no drift)', () => {
    let stderr = ''
    let exitCode = 0
    try {
      execSync('bun run scripts/generate-authoring-md.ts --check', {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf-8',
        timeout: 30_000,
      })
    } catch (err) {
      const e = err as { status?: number; stderr?: string; stdout?: string }
      exitCode = e.status ?? 1
      stderr = e.stderr ?? ''
    }

    if (exitCode !== 0) {
      throw new Error(
        `Generator detected drift in committed authoring docs.\nRun: bun run scripts/generate-authoring-md.ts\nThen commit the updated files.\n\nGenerator output:\n${stderr}`,
      )
    }

    expect(exitCode).toBe(0)
  })
})
