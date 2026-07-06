/**
 * v0.10.9 E-003 — Discriminated `ManifestReadResult` covers the three
 * relevant states of an optional manifest file:
 *   - { present: false }            → legitimately absent
 *   - { present: true, error }      → present but malformed
 *   - { present: true, value }      → present and parsed
 *
 * The pre-v0.10.9 readers collapsed "absent" and "malformed" into a single
 * falsy / null branch, which masked configuration errors. This file
 * exercises all three readers across all three states.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { readModelsJson } from '../../../src/commands/cli/doctor.js'
import { readAnvilManifestTarget } from '../../../src/installer/install.js'
import { readShowSubagentPanel } from '../../../src/installer/wire-claude-code.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

describe('ManifestReadResult readers (E-003)', () => {
  let tmp: string

  beforeEach(() => {
    tmp = createTestTmpDir('manifest-readers')
  })

  describe('readAnvilManifestTarget', () => {
    it('returns { present: false } when manifest.json is absent', async () => {
      const result = await readAnvilManifestTarget(tmp)
      expect(result).toEqual({ present: false })
    })

    it('returns { present: true, error } when manifest.json is malformed JSON', async () => {
      writeFileSync(join(tmp, 'manifest.json'), '{not json', 'utf-8')
      const result = await readAnvilManifestTarget(tmp)
      expect(result.present).toBe(true)
      if (result.present && 'error' in result) {
        expect(result.error).toContain('invalid JSON')
      } else {
        throw new Error('expected error variant')
      }
    })

    it('returns { present: true, error } when installedTarget is missing', async () => {
      writeFileSync(join(tmp, 'manifest.json'), JSON.stringify({}), 'utf-8')
      const result = await readAnvilManifestTarget(tmp)
      expect(result.present).toBe(true)
      if (result.present && 'error' in result) {
        expect(result.error).toContain('installedTarget')
      } else {
        throw new Error('expected error variant')
      }
    })

    it('returns { present: true, value } for each valid target', async () => {
      for (const t of ['claude-code', 'opencode', 'both'] as const) {
        writeFileSync(
          join(tmp, 'manifest.json'),
          JSON.stringify({ installedTarget: t }),
          'utf-8',
        )
        const result = await readAnvilManifestTarget(tmp)
        expect(result).toEqual({ present: true, value: t })
      }
    })
  })

  describe('readShowSubagentPanel', () => {
    it('returns { present: false } when models.json is absent', async () => {
      const result = await readShowSubagentPanel(tmp)
      expect(result).toEqual({ present: false })
    })

    it('returns { present: true, error } when models.json is malformed JSON', async () => {
      writeFileSync(join(tmp, 'models.json'), 'definitely not json', 'utf-8')
      const result = await readShowSubagentPanel(tmp)
      expect(result.present).toBe(true)
      if (result.present && 'error' in result) {
        expect(result.error).toContain('invalid JSON')
      } else {
        throw new Error('expected error variant')
      }
    })

    it('returns { present: true, value: false } when statusline section is absent', async () => {
      writeFileSync(join(tmp, 'models.json'), JSON.stringify({}), 'utf-8')
      const result = await readShowSubagentPanel(tmp)
      expect(result).toEqual({ present: true, value: false })
    })

    it('returns { present: true, value: true } when show_subagent_panel is true', async () => {
      writeFileSync(
        join(tmp, 'models.json'),
        JSON.stringify({ statusline: { show_subagent_panel: true } }),
        'utf-8',
      )
      const result = await readShowSubagentPanel(tmp)
      expect(result).toEqual({ present: true, value: true })
    })

    it('returns { present: true, value: false } when show_subagent_panel is non-true', async () => {
      writeFileSync(
        join(tmp, 'models.json'),
        JSON.stringify({ statusline: { show_subagent_panel: false } }),
        'utf-8',
      )
      const result = await readShowSubagentPanel(tmp)
      expect(result).toEqual({ present: true, value: false })
    })
  })

  describe('readModelsJson', () => {
    it('returns { present: false } when models.json is absent', async () => {
      const result = await readModelsJson(join(tmp, 'models.json'))
      expect(result).toEqual({ present: false })
    })

    it('returns { present: true, error } when models.json is malformed JSON', async () => {
      const p = join(tmp, 'models.json')
      writeFileSync(p, '{not json}', 'utf-8')
      const result = await readModelsJson(p)
      expect(result.present).toBe(true)
      if (result.present && 'error' in result) {
        expect(result.error).toContain('invalid JSON')
      } else {
        throw new Error('expected error variant')
      }
    })

    it('returns { present: true, value } when models.json is valid', async () => {
      const p = join(tmp, 'models.json')
      writeFileSync(
        p,
        JSON.stringify({ defaults: { model: 'sonnet' } }),
        'utf-8',
      )
      const result = await readModelsJson(p)
      expect(result).toEqual({
        present: true,
        value: { defaults: { model: 'sonnet' } },
      })
    })
  })
})
