/**
 * ANV-0203 (P1) — Zod schema round-trip tests for registry-types.ts
 */
import { describe, expect, it } from 'vitest'
import {
  ExtensionsDoctorRow,
  InstallRecord,
  InstallSource,
  Registry,
  UninstallRequest,
} from '../../../../src/installer/extensions/registry-types.js'

// ---------------------------------------------------------------------------
// InstallSource
// ---------------------------------------------------------------------------
describe('InstallSource', () => {
  it('accepts a valid archive source', () => {
    const result = InstallSource.safeParse({
      kind: 'archive',
      path: '/tmp/ext.tar.gz',
      sha256: 'a'.repeat(64),
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid directory source', () => {
    const result = InstallSource.safeParse({
      kind: 'directory',
      path: '/tmp/ext-dir',
    })
    expect(result.success).toBe(true)
  })

  it('rejects archive source with invalid sha256 (wrong length)', () => {
    const result = InstallSource.safeParse({
      kind: 'archive',
      path: '/tmp/ext.tar.gz',
      sha256: 'abc123',
    })
    expect(result.success).toBe(false)
  })

  it('rejects archive source with uppercase sha256', () => {
    const result = InstallSource.safeParse({
      kind: 'archive',
      path: '/tmp/ext.tar.gz',
      sha256: 'A'.repeat(64),
    })
    expect(result.success).toBe(false)
  })

  it('rejects archive source with empty path', () => {
    const result = InstallSource.safeParse({
      kind: 'archive',
      path: '',
      sha256: 'a'.repeat(64),
    })
    expect(result.success).toBe(false)
  })

  it('rejects directory source with empty path', () => {
    const result = InstallSource.safeParse({
      kind: 'directory',
      path: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects unknown kind', () => {
    const result = InstallSource.safeParse({
      kind: 'https',
      url: 'https://example.com/ext.tar.gz',
    })
    expect(result.success).toBe(false)
  })

  it('narrows discriminated union correctly — archive has sha256', () => {
    const parsed = InstallSource.parse({
      kind: 'archive',
      path: '/tmp/ext.tar.gz',
      sha256: 'f'.repeat(64),
    })
    expect(parsed.kind).toBe('archive')
    if (parsed.kind === 'archive') {
      expect(parsed.sha256).toBe('f'.repeat(64))
    }
  })

  it('narrows discriminated union correctly — directory has no sha256', () => {
    const parsed = InstallSource.parse({
      kind: 'directory',
      path: '/tmp/ext-dir',
    })
    expect(parsed.kind).toBe('directory')
    // directory variant should not have sha256 (strict)
    expect(Object.keys(parsed)).not.toContain('sha256')
  })
})

// ---------------------------------------------------------------------------
// InstallRecord
// ---------------------------------------------------------------------------
describe('InstallRecord', () => {
  const validManifest = {
    schema_version: '1.0.0',
    name: 'my-ext',
    version: '0.1.0',
    description: 'A test extension',
    kind: 'extension',
    provides: {},
    requires: [],
    compatibility: { min_anvil_version: '0.15.0' },
  }

  const validRecord = {
    schema_version: '1.0.0',
    name: 'my-ext',
    version: '0.1.0',
    installed_at: new Date().toISOString(),
    source: { kind: 'directory', path: '/tmp/ext' },
    manifest: validManifest,
  }

  it('accepts a valid install record', () => {
    expect(InstallRecord.safeParse(validRecord).success).toBe(true)
  })

  it('rejects record with non-semver schema_version', () => {
    expect(
      InstallRecord.safeParse({ ...validRecord, schema_version: 'v1' }).success,
    ).toBe(false)
  })

  it('rejects record with slug-invalid name', () => {
    expect(
      InstallRecord.safeParse({ ...validRecord, name: '_hidden' }).success,
    ).toBe(false)
  })

  it('rejects record with non-datetime installed_at', () => {
    expect(
      InstallRecord.safeParse({ ...validRecord, installed_at: '2024-01-01' })
        .success,
    ).toBe(false)
  })

  it('round-trips through parse + JSON.stringify + parse', () => {
    const parsed = InstallRecord.parse(validRecord)
    const roundTripped = InstallRecord.parse(JSON.parse(JSON.stringify(parsed)))
    expect(roundTripped).toEqual(parsed)
  })
})

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
describe('Registry', () => {
  it('schema_version is the literal "1.0.0"', () => {
    const valid = Registry.safeParse({
      schema_version: '1.0.0',
      extensions: {},
    })
    expect(valid.success).toBe(true)
  })

  it('rejects schema_version other than "1.0.0"', () => {
    expect(
      Registry.safeParse({ schema_version: '2.0.0', extensions: {} }).success,
    ).toBe(false)
    expect(
      Registry.safeParse({ schema_version: '1.0.1', extensions: {} }).success,
    ).toBe(false)
  })

  it('accepts an empty extensions map', () => {
    expect(
      Registry.safeParse({ schema_version: '1.0.0', extensions: {} }).success,
    ).toBe(true)
  })

  it('rejects extra fields (strict)', () => {
    expect(
      Registry.safeParse({
        schema_version: '1.0.0',
        extensions: {},
        extra: true,
      }).success,
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// UninstallRequest
// ---------------------------------------------------------------------------
describe('UninstallRequest', () => {
  it('accepts valid request with default force=false', () => {
    const r = UninstallRequest.parse({ name: 'my-ext' })
    expect(r.force).toBe(false)
  })

  it('accepts force=true', () => {
    const r = UninstallRequest.parse({ name: 'my-ext', force: true })
    expect(r.force).toBe(true)
  })

  it('rejects slug-invalid name', () => {
    expect(UninstallRequest.safeParse({ name: '_private' }).success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ExtensionsDoctorRow
// ---------------------------------------------------------------------------
describe('ExtensionsDoctorRow', () => {
  it('accepts a clean row', () => {
    const row = ExtensionsDoctorRow.safeParse({
      installedCount: 3,
      schemaInvalid: [],
      unresolvedCollisions: [],
      registryError: null,
    })
    expect(row.success).toBe(true)
  })

  it('accepts a row with errors', () => {
    const row = ExtensionsDoctorRow.safeParse({
      installedCount: 1,
      schemaInvalid: [{ name: 'bad-ext', reason: 'version mismatch' }],
      unresolvedCollisions: [
        {
          name: 'my-ext',
          collisions: [{ tier: 1, kind: 'skill', slug: 'my-skill' }],
        },
      ],
      registryError: 'ENOENT',
    })
    expect(row.success).toBe(true)
  })

  it('rejects non-integer installedCount', () => {
    expect(
      ExtensionsDoctorRow.safeParse({
        installedCount: 1.5,
        schemaInvalid: [],
        unresolvedCollisions: [],
        registryError: null,
      }).success,
    ).toBe(false)
  })

  it('rejects negative installedCount', () => {
    expect(
      ExtensionsDoctorRow.safeParse({
        installedCount: -1,
        schemaInvalid: [],
        unresolvedCollisions: [],
        registryError: null,
      }).success,
    ).toBe(false)
  })

  it('rejects tier values outside 1|2|3', () => {
    expect(
      ExtensionsDoctorRow.safeParse({
        installedCount: 1,
        schemaInvalid: [],
        unresolvedCollisions: [
          {
            name: 'my-ext',
            collisions: [{ tier: 4, kind: 'skill', slug: 'foo' }],
          },
        ],
        registryError: null,
      }).success,
    ).toBe(false)
  })
})
