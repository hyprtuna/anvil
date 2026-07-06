import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveAlias } from '../../../../src/core/models/aliases.js'
import { BUILTIN_SUPPORTED_EFFORTS } from '../../../../src/core/models/effort.js'

/**
 * Plan 41 Phase B — every preset's model fields must, after alias resolution,
 * land on a concrete model ID known to BUILTIN_SUPPORTED_EFFORTS. This is the
 * round-trip guarantee: presets reference aliases, aliases resolve to concrete
 * IDs, and effort.ts knows them.
 */

const REPO = join(__dirname, '..', '..', '..', '..')
const PRESETS = ['balanced', 'cost-optimised', 'speed-first', 'max-quality']

interface PresetShape {
  defaults?: { model?: string; fallback_model?: string }
  groups?: Record<string, { model?: string }>
  overrides?: Record<string, { model?: string }>
  model_aliases?: Record<string, string>
}

function loadPreset(name: string): PresetShape {
  const p = join(REPO, 'presets', `${name}.json`)
  return JSON.parse(readFileSync(p, 'utf-8')) as PresetShape
}

function gatherModelFields(
  p: PresetShape,
): Array<{ where: string; value: string }> {
  const out: Array<{ where: string; value: string }> = []
  if (p.defaults?.model)
    out.push({ where: 'defaults.model', value: p.defaults.model })
  if (p.defaults?.fallback_model)
    out.push({
      where: 'defaults.fallback_model',
      value: p.defaults.fallback_model,
    })
  for (const [g, cfg] of Object.entries(p.groups ?? {})) {
    if (cfg?.model) out.push({ where: `groups.${g}.model`, value: cfg.model })
  }
  for (const [o, cfg] of Object.entries(p.overrides ?? {})) {
    if (cfg?.model)
      out.push({ where: `overrides.${o}.model`, value: cfg.model })
  }
  return out
}

describe('preset round-trip resolution (Plan 41 Phase B)', () => {
  for (const name of PRESETS) {
    it(`every model field in ${name}.json resolves to a known concrete ID`, () => {
      const preset = loadPreset(name)
      const userAliases = preset.model_aliases ?? {}
      const fields = gatherModelFields(preset)
      expect(fields.length).toBeGreaterThan(0)
      for (const { where, value } of fields) {
        const resolved = resolveAlias(value, userAliases)
        expect(
          resolved in BUILTIN_SUPPORTED_EFFORTS,
          `${name}.json ${where} = "${value}" → "${resolved}" (not in BUILTIN_SUPPORTED_EFFORTS)`,
        ).toBe(true)
      }
    })
  }
})
