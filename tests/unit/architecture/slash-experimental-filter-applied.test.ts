/**
 * ANV-0257 — Architecture guard: every slash-emitting adapter must route
 * through filterEmittableSlashCommands before rendering.
 *
 * This test uses source-file string inspection (grep-on-source) to verify
 * that each adapter file in SLASH_EMITTING_ADAPTERS imports the shared
 * filter helper from src/core/slash-filter.ts.
 *
 * It also verifies that adapters which do NOT yet emit slash commands
 * (listed in SLASH_PENDING_ADAPTERS) carry the expected TODO sentinel so
 * future implementers know to wire the filter when adding emission.
 *
 * HOW TO UPDATE THIS TEST:
 *   - When a new adapter starts emitting slash commands: move its path from
 *     SLASH_PENDING_ADAPTERS to SLASH_EMITTING_ADAPTERS and ensure it imports
 *     filterEmittableSlashCommands.
 *   - When a new adapter is added but does not yet emit: add its path to
 *     SLASH_PENDING_ADAPTERS.
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')

/**
 * Adapter source files that currently emit slash command files.
 * Each file MUST import `filterEmittableSlashCommands` from `slash-filter`.
 */
const SLASH_EMITTING_ADAPTERS: readonly string[] = [
  'src/adapters/claude-code/generate.ts',
]

/**
 * Adapter source files that do NOT yet emit slash commands.
 * Each file MUST contain the SLASH-FILTER-WIRED sentinel comment so the
 * author of the slash-emission feature knows to call the filter.
 */
const SLASH_PENDING_ADAPTERS: readonly string[] = [
  'src/adapters/opencode/generate.ts',
]

describe('architecture: slash-emitting adapters use filterEmittableSlashCommands', () => {
  for (const relPath of SLASH_EMITTING_ADAPTERS) {
    it(`${relPath} imports filterEmittableSlashCommands from slash-filter`, () => {
      const content = readFileSync(join(REPO_ROOT, relPath), 'utf-8')
      expect(
        content,
        `${relPath} must import filterEmittableSlashCommands from ../../core/slash-filter.js. Every adapter that emits slash commands must filter experimental commands before rendering (ANV-0257). Add the import and call the filter.`,
      ).toMatch(/filterEmittableSlashCommands/)

      expect(
        content,
        `${relPath} must import filterEmittableSlashCommands from the core slash-filter module`,
      ).toMatch(/from ['"].*slash-filter(?:\.js)?['"]/)
    })

    it(`${relPath} calls filterEmittableSlashCommands (not just imports it)`, () => {
      const content = readFileSync(join(REPO_ROOT, relPath), 'utf-8')
      // Must appear as a function call (not just an import or comment).
      expect(
        content,
        `${relPath} must call filterEmittableSlashCommands(...) — importing without calling does not protect against experimental command leakage.`,
      ).toMatch(/filterEmittableSlashCommands\s*\(/)
    })
  }

  for (const relPath of SLASH_PENDING_ADAPTERS) {
    it(`${relPath} carries SLASH-FILTER-WIRED sentinel (not yet emitting slash commands)`, () => {
      const content = readFileSync(join(REPO_ROOT, relPath), 'utf-8')
      expect(
        content,
        `${relPath} must contain a "SLASH-FILTER-WIRED:" sentinel comment. This ensures the author who adds slash emission to this adapter knows to wire filterEmittableSlashCommands. See ANV-0257.`,
      ).toMatch(/SLASH-FILTER-WIRED:/)
    })
  }
})
