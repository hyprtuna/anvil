/**
 * ANV-0027 — Integration: parseManifest → safeExtract → detectCollisions.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  detectCollisions,
  parseManifest,
  safeExtract,
} from '../../../../src/installer/extensions/index.js'
import type {
  CollisionContext,
  ExtensionManifest,
} from '../../../../src/installer/extensions/index.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

describe('extensions library roundtrip', () => {
  let tmp: string

  beforeEach(() => {
    tmp = createTestTmpDir('extensions-roundtrip')
  })

  it('parses a manifest, extracts the archive, and detects a tier-2 collision', async () => {
    const stage = join(tmp, 'stage')
    mkdirSync(stage)
    const manifestObj = {
      schema_version: '1.0.0',
      name: 'demo-pack',
      version: '0.1.0',
      description: 'roundtrip fixture',
      kind: 'extension',
      provides: {
        skill: ['code-review'],
      },
      requires: ['anvil:agent/code-architect'],
      compatibility: { min_anvil_version: '0.15.6' },
    }
    writeFileSync(
      join(stage, 'manifest.json'),
      JSON.stringify(manifestObj, null, 2),
    )
    writeFileSync(join(stage, 'README.md'), '# demo pack\n')

    const archive = join(tmp, 'demo.tar.gz')
    const tarRun = spawnSync(
      'tar',
      ['-czf', archive, '-C', stage, 'manifest.json', 'README.md'],
      { stdio: 'pipe' },
    )
    expect(tarRun.status).toBe(0)

    const target = join(tmp, 'installed', 'demo-pack')
    const extracted = await safeExtract(archive, target)
    expect(extracted.ok).toBe(true)
    if (!extracted.ok) return

    const raw = JSON.parse(readFileSync(join(target, 'manifest.json'), 'utf8'))
    const parsed = parseManifest(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const ctx: CollisionContext = {
      bundled: {
        skill: new Set(['code-review', 'debugging']),
        agent: new Set(['code-architect']),
        hook: new Set<string>(),
        command: new Set<string>(),
      },
      installed: [],
    }
    const collisions = detectCollisions(parsed.value as ExtensionManifest, ctx)
    expect(collisions).toHaveLength(1)
    expect(collisions[0]?.tier).toBe(2)
    expect(collisions[0]?.kind).toBe('skill')
    expect(collisions[0]?.slug).toBe('code-review')
  })
})
