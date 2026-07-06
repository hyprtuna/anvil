import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RENAMES } from './rename-map.js'

/**
 * Parameterized over the Plan 40 audit's 70-row table.
 * For each rename: new path exists; old path does not.
 */

describe('naming — expected-renames-v0.10.3 (Plan 40 audit)', () => {
  it('audit table covers exactly 70 renames', () => {
    expect(RENAMES.length).toBe(70)
  })

  for (const r of RENAMES) {
    describe(`[${r.group}] ${r.oldSlug} → ${r.newSlug}`, () => {
      it('new path exists', () => {
        expect(existsSync(r.newPath), `expected new file at ${r.newPath}`).toBe(
          true,
        )
      })
      it('old path does not exist', () => {
        expect(
          existsSync(r.oldPath),
          `old file should be removed: ${r.oldPath}`,
        ).toBe(false)
      })
    })
  }
})
