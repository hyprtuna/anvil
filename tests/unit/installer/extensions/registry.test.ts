/**
 * ANV-0203 (P1) — Registry read/write/upsert/remove tests
 */
import { rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { InstallRecord } from '../../../../src/installer/extensions/registry-types.js'
import {
  loadRegistry,
  removeExtension,
  saveRegistry,
  upsertExtension,
} from '../../../../src/installer/extensions/registry.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

// ─── Fixture helpers ─────────────────────────────────────────────────────────

function makeRecord(name: string): InstallRecord {
  return {
    schema_version: '1.0.0',
    name,
    version: '0.1.0',
    installed_at: new Date().toISOString(),
    source: { kind: 'directory', path: '/tmp/src' },
    manifest: {
      schema_version: '1.0.0',
      name,
      version: '0.1.0',
      description: 'A test extension',
      kind: 'extension',
      provides: {},
      requires: [],
      compatibility: { min_anvil_version: '0.15.0' },
    },
  }
}

// ─── Test setup ──────────────────────────────────────────────────────────────

let anvilHome: string

beforeEach(() => {
  anvilHome = createTestTmpDir('anvil-registry-test')
})

afterEach(async () => {
  await rm(anvilHome, { recursive: true, force: true })
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('loadRegistry', () => {
  it('returns an empty registry when the file does not exist', async () => {
    const reg = await loadRegistry(anvilHome)
    expect(reg).toEqual({ schema_version: '1.0.0', extensions: {} })
  })

  it('round-trips an empty registry (save then load)', async () => {
    await saveRegistry(anvilHome, { schema_version: '1.0.0', extensions: {} })
    const reg = await loadRegistry(anvilHome)
    expect(reg.schema_version).toBe('1.0.0')
    expect(reg.extensions).toEqual({})
  })
})

describe('upsertExtension', () => {
  it('inserts a new record and can be loaded back', async () => {
    const rec = makeRecord('my-ext')
    await upsertExtension(anvilHome, rec)
    const reg = await loadRegistry(anvilHome)
    expect(reg.extensions['my-ext']).toBeDefined()
    expect(reg.extensions['my-ext']?.name).toBe('my-ext')
  })

  it('updates an existing record on re-upsert', async () => {
    await upsertExtension(anvilHome, makeRecord('my-ext'))
    const updated = { ...makeRecord('my-ext'), version: '0.2.0' }
    await upsertExtension(anvilHome, updated)
    const reg = await loadRegistry(anvilHome)
    expect(reg.extensions['my-ext']?.version).toBe('0.2.0')
  })

  it('rejects extension names starting with _', async () => {
    const bad = makeRecord('my-ext')
    // Forcibly bypass Zod by crafting an object with a bad name
    // (we still expect upsertExtension to guard against it)
    const badRecord = { ...bad, name: '_private' as string }
    await expect(
      upsertExtension(
        anvilHome,
        badRecord as unknown as Parameters<typeof upsertExtension>[1],
      ),
    ).rejects.toThrow()
  })

  it('stores multiple extensions independently', async () => {
    await upsertExtension(anvilHome, makeRecord('ext-a'))
    await upsertExtension(anvilHome, makeRecord('ext-b'))
    const reg = await loadRegistry(anvilHome)
    expect(Object.keys(reg.extensions).sort()).toEqual(['ext-a', 'ext-b'])
  })
})

describe('removeExtension', () => {
  it('removes an existing extension', async () => {
    await upsertExtension(anvilHome, makeRecord('my-ext'))
    await removeExtension(anvilHome, 'my-ext')
    const reg = await loadRegistry(anvilHome)
    expect(reg.extensions['my-ext']).toBeUndefined()
  })

  it('is a no-op when the extension does not exist', async () => {
    // Should not throw
    await expect(removeExtension(anvilHome, 'ghost-ext')).resolves.not.toThrow()
  })

  it('does not affect other extensions when removing one', async () => {
    await upsertExtension(anvilHome, makeRecord('ext-a'))
    await upsertExtension(anvilHome, makeRecord('ext-b'))
    await removeExtension(anvilHome, 'ext-a')
    const reg = await loadRegistry(anvilHome)
    expect(reg.extensions['ext-b']).toBeDefined()
    expect(reg.extensions['ext-a']).toBeUndefined()
  })
})

describe('concurrent write safety', () => {
  it('two concurrent upserts both succeed without corruption', async () => {
    const recA = makeRecord('ext-concurrent-a')
    const recB = makeRecord('ext-concurrent-b')

    // Fire both concurrently — both should succeed and both keys present
    await Promise.all([
      upsertExtension(anvilHome, recA),
      upsertExtension(anvilHome, recB),
    ])

    const reg = await loadRegistry(anvilHome)
    // Both entries must exist; registry must be valid JSON
    expect(reg.extensions['ext-concurrent-a']).toBeDefined()
    expect(reg.extensions['ext-concurrent-b']).toBeDefined()
  })
})
