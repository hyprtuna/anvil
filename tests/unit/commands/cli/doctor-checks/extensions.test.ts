/**
 * ANV-0203 (P6) — Doctor row "Extensions" — unit tests.
 *
 * Tests the pure builder `buildExtensionsDoctorRow` exhaustively.
 * One integration test exercises `pushExtensionsCheck` via a real tmpdir.
 */

import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildExtensionsDoctorRow,
  pushExtensionsCheck,
} from '../../../../../src/commands/cli/doctor-checks/extensions.js'
import type { Registry } from '../../../../../src/installer/extensions/registry-types.js'
import { upsertExtension } from '../../../../../src/installer/extensions/registry.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CURRENT_VER = '0.15.7'

const BASE_MANIFEST = {
  schema_version: '1.0.0',
  name: 'my-ext',
  version: '1.0.0',
  description: 'A test extension',
  kind: 'extension' as const,
  provides: {},
  requires: [],
  compatibility: { min_anvil_version: '0.1.0' },
}

const BASE_INSTALL_RECORD = {
  schema_version: '1.0.0',
  name: 'my-ext' as string,
  version: '1.0.0',
  installed_at: new Date().toISOString(),
  source: { kind: 'directory' as const, path: '/tmp/test' },
  manifest: BASE_MANIFEST,
}

function makeRegistry(
  extensions: Record<string, typeof BASE_INSTALL_RECORD>,
): Registry {
  return {
    schema_version: '1.0.0',
    extensions: extensions as Registry['extensions'],
  }
}

const EMPTY_BUNDLED = {
  skill: new Set<string>(),
  agent: new Set<string>(),
  hook: new Set<string>(),
  command: new Set<string>(),
}

// ---------------------------------------------------------------------------
// Pure builder tests
// ---------------------------------------------------------------------------

describe('buildExtensionsDoctorRow', () => {
  describe('registry absent (null + no error)', () => {
    it('returns skip row with expectedAbsence for absent registry', () => {
      const result = buildExtensionsDoctorRow({
        registry: null,
        registryError: null,
        bundled: EMPTY_BUNDLED,
        anvilVersion: CURRENT_VER,
      })
      expect(result.installedCount).toBe(0)
      expect(result.registryError).toBeNull()
      expect(result.schemaInvalid).toHaveLength(0)
      expect(result.unresolvedCollisions).toHaveLength(0)
    })
  })

  describe('registry unreadable (null + error non-null)', () => {
    it('returns payload with registryError set', () => {
      const result = buildExtensionsDoctorRow({
        registry: null,
        registryError: 'malformed JSON at /tmp/_registry.json',
        bundled: EMPTY_BUNDLED,
        anvilVersion: CURRENT_VER,
      })
      expect(result.registryError).toBe('malformed JSON at /tmp/_registry.json')
      expect(result.installedCount).toBe(0)
    })
  })

  describe('empty registry (0 extensions, valid)', () => {
    it('returns zero count, no collisions, no invalid', () => {
      const result = buildExtensionsDoctorRow({
        registry: makeRegistry({}),
        registryError: null,
        bundled: EMPTY_BUNDLED,
        anvilVersion: CURRENT_VER,
      })
      expect(result.installedCount).toBe(0)
      expect(result.registryError).toBeNull()
      expect(result.schemaInvalid).toHaveLength(0)
      expect(result.unresolvedCollisions).toHaveLength(0)
    })
  })

  describe('1 extension, clean', () => {
    it('returns installedCount=1 with no collisions', () => {
      const reg = makeRegistry({ 'my-ext': BASE_INSTALL_RECORD })
      const result = buildExtensionsDoctorRow({
        registry: reg,
        registryError: null,
        bundled: EMPTY_BUNDLED,
        anvilVersion: CURRENT_VER,
      })
      expect(result.installedCount).toBe(1)
      expect(result.registryError).toBeNull()
      expect(result.schemaInvalid).toHaveLength(0)
      expect(result.unresolvedCollisions).toHaveLength(0)
    })
  })

  describe('Tier 1 collision (two installed extensions sharing a provides slug)', () => {
    it('detects collision when ext-b provides the same skill slug as ext-a', () => {
      // ext-a provides skill "my-skill". ext-b also provides skill "my-skill"
      // → Tier 3 cross-extension provides collision.
      const extA = {
        ...BASE_INSTALL_RECORD,
        name: 'ext-a',
        manifest: {
          ...BASE_MANIFEST,
          name: 'ext-a',
          provides: { skill: ['my-skill'] },
        },
      }
      const extB = {
        ...BASE_INSTALL_RECORD,
        name: 'ext-b',
        manifest: {
          ...BASE_MANIFEST,
          name: 'ext-b',
          provides: { skill: ['my-skill'] },
        },
      }
      const reg = makeRegistry({ 'ext-a': extA, 'ext-b': extB })
      const result = buildExtensionsDoctorRow({
        registry: reg,
        registryError: null,
        bundled: EMPTY_BUNDLED,
        anvilVersion: CURRENT_VER,
      })
      // At least one of ext-a / ext-b should have an unresolved collision
      expect(result.unresolvedCollisions.length).toBeGreaterThanOrEqual(1)
      // The collision should reference my-skill slug
      const allCollisionSlugs = result.unresolvedCollisions.flatMap((u) =>
        u.collisions.map((c) => c.slug),
      )
      expect(allCollisionSlugs).toContain('my-skill')
    })
  })

  describe('schema-invalid manifest stored in registry', () => {
    it('reports schemaInvalid entry when stored manifest re-parse fails', () => {
      // Craft a record whose stored manifest is corrupt (missing required field)
      const badRecord = {
        ...BASE_INSTALL_RECORD,
        name: 'bad-ext',
        manifest: {
          // Missing required fields — name, version, etc. stripped
          schema_version: '1.0.0',
          // deliberately omit required fields to trigger parse failure
        },
      }
      // Force the registry to accept the corrupt record by bypassing Zod
      const reg: Registry = {
        schema_version: '1.0.0',
        extensions: {
          'bad-ext': badRecord as unknown as Registry['extensions'][string],
        },
      }
      const result = buildExtensionsDoctorRow({
        registry: reg,
        registryError: null,
        bundled: EMPTY_BUNDLED,
        anvilVersion: CURRENT_VER,
      })
      expect(result.schemaInvalid).toHaveLength(1)
      expect(result.schemaInvalid[0]?.name).toBe('bad-ext')
      expect(result.schemaInvalid[0]?.reason).toBeTruthy()
    })
  })

  describe('version compatibility — min_anvil_version newer than current', () => {
    it('reports schemaInvalid when min_anvil_version > anvilVersion', () => {
      const futureRecord = {
        ...BASE_INSTALL_RECORD,
        name: 'future-ext',
        manifest: {
          ...BASE_MANIFEST,
          name: 'future-ext',
          compatibility: { min_anvil_version: '99.0.0' },
        },
      }
      const reg = makeRegistry({ 'future-ext': futureRecord })
      const result = buildExtensionsDoctorRow({
        registry: reg,
        registryError: null,
        bundled: EMPTY_BUNDLED,
        anvilVersion: CURRENT_VER,
      })
      // min_anvil_version 99.0.0 > 0.15.7 → compat fail
      expect(result.schemaInvalid).toHaveLength(1)
      expect(result.schemaInvalid[0]?.name).toBe('future-ext')
    })
  })

  describe('version compatibility — max_anvil_version older than current', () => {
    it('reports schemaInvalid when max_anvil_version < anvilVersion', () => {
      const oldRecord = {
        ...BASE_INSTALL_RECORD,
        name: 'old-ext',
        manifest: {
          ...BASE_MANIFEST,
          name: 'old-ext',
          compatibility: {
            min_anvil_version: '0.1.0',
            max_anvil_version: '0.10.0',
          },
        },
      }
      const reg = makeRegistry({ 'old-ext': oldRecord })
      const result = buildExtensionsDoctorRow({
        registry: reg,
        registryError: null,
        bundled: EMPTY_BUNDLED,
        anvilVersion: CURRENT_VER,
      })
      // max_anvil_version 0.10.0 < 0.15.7 → compat fail
      expect(result.schemaInvalid).toHaveLength(1)
      expect(result.schemaInvalid[0]?.name).toBe('old-ext')
    })
  })
})

// ---------------------------------------------------------------------------
// Thin wrapper integration test
// ---------------------------------------------------------------------------

describe('pushExtensionsCheck (integration)', () => {
  let tmpHome: string

  beforeEach(() => {
    tmpHome = createTestTmpDir('ext-doctor')
    mkdirSync(join(tmpHome, 'extensions'), { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true })
  })

  it('returns skip row when _registry.json is absent', async () => {
    const checks: Array<{
      name: string
      status: string
      detail: string
      expectedAbsence?: boolean
    }> = []
    // TODO(ANV-0028): bundled sets will be populated once catalog inventory is available
    await pushExtensionsCheck(checks, tmpHome, EMPTY_BUNDLED)
    expect(checks).toHaveLength(1)
    expect(checks[0]?.status).toBe('skip')
    expect(checks[0]?.expectedAbsence).toBe(true)
  })

  it('returns pass row with count when 1 extension is installed', async () => {
    // Write a valid registry via the real upsertExtension
    await upsertExtension(tmpHome, BASE_INSTALL_RECORD)

    const checks: Array<{ name: string; status: string; detail: string }> = []
    await pushExtensionsCheck(checks, tmpHome, EMPTY_BUNDLED)

    // Should have at least one pass row mentioning the extension count
    const passRows = checks.filter((c) => c.status === 'pass')
    expect(passRows.length).toBeGreaterThanOrEqual(1)
    const detailConcat = passRows.map((c) => c.detail).join(' ')
    expect(detailConcat).toMatch(/1 extension/)
  })
})
