import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPreset } from '../../../../src/core/config/presets.js'
import type { PresetName } from '../../../../src/core/types.js'

/**
 * Plan 41 Phase B — `presets/*.json` files are serialized snapshots of
 * `buildPreset()` output. The TS builder is the source of truth (it uses
 * short aliases `HAIKU`/`SONNET`/`OPUS` exclusively). This test asserts the
 * JSON snapshots match the builder verbatim — drift fails the build.
 *
 * Regenerate with: `bun run scripts/regen-preset-snapshots.ts`
 */

const REPO = join(__dirname, '..', '..', '..', '..')
const PRESETS: ReadonlyArray<PresetName> = [
  'balanced',
  'cost-optimised',
  'speed-first',
  'max-quality',
]

describe('preset snapshot drift (Plan 41 Phase B)', () => {
  for (const name of PRESETS) {
    it(`presets/${name}.json matches buildPreset('${name}')`, () => {
      const onDisk = JSON.parse(
        readFileSync(join(REPO, 'presets', `${name}.json`), 'utf-8'),
      )
      const fromBuilder = buildPreset(name)
      // Builder output may not include the $schema/version envelope the JSON
      // file carries — only diff the model-config payload that overlaps.
      const overlap = (obj: Record<string, unknown>) => ({
        defaults: obj.defaults,
        groups: obj.groups,
        overrides: obj.overrides,
        effort_levels: obj.effort_levels,
        model_aliases: obj.model_aliases,
      })
      expect(overlap(onDisk)).toEqual(
        overlap(fromBuilder as unknown as Record<string, unknown>),
      )
    })
  }
})
