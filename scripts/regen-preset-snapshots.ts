#!/usr/bin/env tsx
/**
 * Plan 41 Phase C — regenerate `presets/*.json` from `buildPreset()`.
 *
 * The TS builder in `src/core/config/presets.ts` is the source of truth for
 * preset content. The JSON files under `presets/` are sample/reference
 * artifacts (NOT loaded at runtime — runtime calls `buildPreset(name)`
 * directly). Whenever the builder changes, run this script to keep the
 * snapshots in sync. A vitest drift check (`tests/unit/core/config/
 * preset-snapshot-drift.test.ts`) fails the build if they drift.
 *
 * Usage:
 *   bun run scripts/regen-preset-snapshots.ts
 *   tsx scripts/regen-preset-snapshots.ts
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPreset } from '../src/core/config/presets.js'
import type { PresetName } from '../src/core/types.js'

const PRESETS: ReadonlyArray<PresetName> = [
  'balanced',
  'cost-optimised',
  'speed-first',
  'max-quality',
]

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO = join(HERE, '..')

for (const name of PRESETS) {
  const cfg = buildPreset(name)
  const envelope: Record<string, unknown> = {
    $schema: 'https://anvil.dev/schemas/models.json',
    version: '1.0',
    ...(cfg as unknown as Record<string, unknown>),
  }
  // Drop `tiers` and `agents` and `hooks` blocks for the snapshot — presets
  // historically only carried defaults/groups/overrides/effort_levels/model_aliases/disabled.
  // Preserve only the fields the on-disk snapshots have always exposed.
  const out = {
    $schema: envelope.$schema,
    version: envelope.version,
    defaults: envelope.defaults,
    groups: envelope.groups,
    overrides: envelope.overrides,
    effort_levels: envelope.effort_levels,
    model_aliases: envelope.model_aliases,
    disabled: envelope.disabled,
  }
  const path = join(REPO, 'presets', `${name}.json`)
  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`, 'utf-8')
  process.stdout.write(`wrote ${path}\n`)
}
