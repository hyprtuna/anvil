/**
 * ANV-0261 — Experimental stub-gate exit code 64.
 *
 * The three experimental stub commands (catalog, note, notepad) must exit
 * with code 64 (feature unavailable / gated), not 1 (generic failure).
 * Code 64 lets callers distinguish "feature not installed" from "program crash".
 *
 * Convention documented in docs/anvil/exit-codes.md.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const binPath = join(__dirname, '..', '..', 'bin', 'anvil.cjs')

describe('integration: experimental stub-gate exit code 64', () => {
  const GATED_COMMANDS: Array<{ name: string; args: string[] }> = [
    { name: 'catalog', args: ['catalog', 'list'] },
    { name: 'note', args: ['note', 'list'] },
    { name: 'notepad', args: ['notepad', 'read'] },
  ]

  for (const { name, args } of GATED_COMMANDS) {
    it(`anvil ${name} exits 64 and writes a gate message to stderr`, () => {
      const result = spawnSync('node', [binPath, ...args], {
        encoding: 'utf-8',
      })

      expect(result.status).toBe(64)
      expect(result.stderr ?? '').toMatch(/experimental/i)
      expect(result.stderr ?? '').toMatch(/anvil@experimental/i)
    })
  }
})
