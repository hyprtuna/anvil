/**
 * ANV-0028 (P1) — Zod schema round-trip tests for src/core/catalog/types.ts
 */

import { describe, expect, it } from 'vitest'
import {
  CatalogIndex,
  CatalogIndexEntry,
  CatalogSource,
  PromotionResult,
  ProvenanceMetadata,
  QuarantineRecord,
  ValidationOutcome,
} from '../../../../src/experimental/catalog/core/types.js'

// ─── CatalogSource ─────────────────────────────────────────────────────────

describe('CatalogSource', () => {
  const valid: CatalogSource = {
    id: 'wshobson',
    display_name: 'wshobson Community Catalog',
    index_url: 'https://example.com/index.json',
    trust_tier: 'community',
  }

  it('round-trips a valid source', () => {
    const parsed = CatalogSource.parse(valid)
    expect(parsed).toEqual(valid)
  })

  it('accepts optional default_license_hint', () => {
    const parsed = CatalogSource.parse({
      ...valid,
      default_license_hint: 'MIT',
    })
    expect(parsed.default_license_hint).toBe('MIT')
  })

  it('rejects non-HTTPS index_url', () => {
    expect(() =>
      CatalogSource.parse({
        ...valid,
        index_url: 'http://example.com/index.json',
      }),
    ).toThrow()
  })

  it('rejects invalid id (uppercase)', () => {
    expect(() => CatalogSource.parse({ ...valid, id: 'WSHOBSON' })).toThrow()
  })

  it('rejects missing trust_tier', () => {
    const { trust_tier: _, ...rest } = valid
    expect(() => CatalogSource.parse(rest)).toThrow()
  })

  it('rejects unknown trust_tier value', () => {
    expect(() =>
      CatalogSource.parse({ ...valid, trust_tier: 'trusted' }),
    ).toThrow()
  })
})

// ─── CatalogIndexEntry ──────────────────────────────────────────────────────

describe('CatalogIndexEntry', () => {
  const valid: CatalogIndexEntry = {
    slug: 'code-review',
    display_name: 'Code Review Agent',
    description: 'Reviews your code with best practices',
    upstream_repo: 'owner/repo',
    upstream_path: '/',
    upstream_ref: 'abc1234def5678901234567890abcdef12345678',
    fetch_url: 'https://example.com/code-review.tar.gz',
    fetch_kind: 'tarball',
  }

  it('round-trips a valid entry', () => {
    const parsed = CatalogIndexEntry.parse(valid)
    expect(parsed).toEqual(valid)
  })

  it('accepts all fetch_kind values', () => {
    for (const fetch_kind of ['tarball', 'zip', 'tree-listing'] as const) {
      const parsed = CatalogIndexEntry.parse({ ...valid, fetch_kind })
      expect(parsed.fetch_kind).toBe(fetch_kind)
    }
  })

  it('rejects non-HTTPS fetch_url', () => {
    expect(() =>
      CatalogIndexEntry.parse({
        ...valid,
        fetch_url: 'http://example.com/x.tar.gz',
      }),
    ).toThrow()
  })

  it('rejects upstream_ref of "main"', () => {
    expect(() =>
      CatalogIndexEntry.parse({ ...valid, upstream_ref: 'main' }),
    ).toThrow()
  })

  it('rejects upstream_ref of "master"', () => {
    expect(() =>
      CatalogIndexEntry.parse({ ...valid, upstream_ref: 'master' }),
    ).toThrow()
  })
})

// ─── CatalogIndex ────────────────────────────────────────────────────────────

describe('CatalogIndex', () => {
  const valid: CatalogIndex = {
    source_id: 'wshobson',
    schema_version: '1.0.0',
    fetched_at: '2026-05-16T00:00:00.000Z',
    entries: [],
  }

  it('round-trips a valid index', () => {
    const parsed = CatalogIndex.parse(valid)
    expect(parsed).toEqual(valid)
  })

  it('rejects invalid schema_version', () => {
    expect(() =>
      CatalogIndex.parse({ ...valid, schema_version: 'bad-version' }),
    ).toThrow()
  })

  it('rejects invalid fetched_at (non-ISO8601)', () => {
    expect(() =>
      CatalogIndex.parse({ ...valid, fetched_at: 'not-a-date' }),
    ).toThrow()
  })
})

// ─── ProvenanceMetadata ──────────────────────────────────────────────────────

describe('ProvenanceMetadata', () => {
  const valid: ProvenanceMetadata = {
    source_id: 'wshobson',
    source_repo: 'wshobson/agents',
    source_path: '/agents/code-reviewer',
    vendored_at: '2026-05-16T00:00:00.000Z',
    upstream_license: 'MIT',
    upstream_version_or_commit: 'abc1234def5678901234567890abcdef12345678',
    upstream_license_source: 'LICENSE',
  }

  it('round-trips valid provenance', () => {
    const parsed = ProvenanceMetadata.parse(valid)
    expect(parsed).toEqual(valid)
  })

  it('rejects upstream_version_or_commit of "main"', () => {
    expect(() =>
      ProvenanceMetadata.parse({
        ...valid,
        upstream_version_or_commit: 'main',
      }),
    ).toThrow()
  })

  it('rejects upstream_version_or_commit of "master"', () => {
    expect(() =>
      ProvenanceMetadata.parse({
        ...valid,
        upstream_version_or_commit: 'master',
      }),
    ).toThrow()
  })

  it('allows UNKNOWN as upstream_license', () => {
    const parsed = ProvenanceMetadata.parse({
      ...valid,
      upstream_license: 'UNKNOWN',
    })
    expect(parsed.upstream_license).toBe('UNKNOWN')
  })

  it('accepts all license source values', () => {
    for (const src of [
      'plugin.json',
      'LICENSE',
      'declared',
      'unknown',
    ] as const) {
      const parsed = ProvenanceMetadata.parse({
        ...valid,
        upstream_license_source: src,
      })
      expect(parsed.upstream_license_source).toBe(src)
    }
  })

  it('rejects missing vendored_at', () => {
    const { vendored_at: _, ...rest } = valid
    expect(() => ProvenanceMetadata.parse(rest)).toThrow()
  })

  it('rejects invalid vendored_at', () => {
    expect(() =>
      ProvenanceMetadata.parse({ ...valid, vendored_at: 'bad-date' }),
    ).toThrow()
  })
})

// ─── ValidationOutcome ────────────────────────────────────────────────────────

describe('ValidationOutcome', () => {
  const valid: ValidationOutcome = {
    id: 'schema',
    severity: 'block',
    status: 'pass',
    message: 'Manifest validated successfully',
  }

  it('round-trips a valid outcome', () => {
    const parsed = ValidationOutcome.parse(valid)
    expect(parsed).toEqual(valid)
  })

  it('accepts optional detail field', () => {
    const parsed = ValidationOutcome.parse({
      ...valid,
      detail: { key: 'value' },
    })
    expect(parsed.detail).toEqual({ key: 'value' })
  })

  it('rejects unknown severity', () => {
    expect(() =>
      ValidationOutcome.parse({ ...valid, severity: 'critical' }),
    ).toThrow()
  })

  it('rejects unknown status', () => {
    expect(() =>
      ValidationOutcome.parse({ ...valid, status: 'pending' }),
    ).toThrow()
  })
})

// ─── PromotionResult ──────────────────────────────────────────────────────────

describe('PromotionResult', () => {
  const valid: PromotionResult = {
    quarantine_id: 'wshobson-code-review-abc1234',
    decision: 'promoted',
    validations: [],
  }

  it('round-trips a valid result', () => {
    const parsed = PromotionResult.parse(valid)
    expect(parsed).toEqual(valid)
  })

  it('accepts written_paths for promoted decision', () => {
    const parsed = PromotionResult.parse({
      ...valid,
      written_paths: ['/path/to/file.md'],
    })
    expect(parsed.written_paths).toEqual(['/path/to/file.md'])
  })

  it('accepts rolled_back field', () => {
    const parsed = PromotionResult.parse({ ...valid, rolled_back: true })
    expect(parsed.rolled_back).toBe(true)
  })

  it('rejects unknown decision value', () => {
    expect(() =>
      PromotionResult.parse({ ...valid, decision: 'skipped' }),
    ).toThrow()
  })
})

// ─── QuarantineRecord (shape check only — full round-trip in quarantine.test.ts) ─

describe('QuarantineRecord (partial)', () => {
  const minimalRecord: QuarantineRecord = {
    quarantine_id: 'wshobson-code-review-abc1234',
    schema_version: '1.0.0',
    created_at: '2026-05-16T00:00:00.000Z',
    source: {
      id: 'wshobson',
      display_name: 'wshobson',
      index_url: 'https://example.com/index.json',
      trust_tier: 'community',
    },
    index_entry: {
      slug: 'code-review',
      display_name: 'Code Review',
      description: 'Reviews code',
      upstream_repo: 'owner/repo',
      upstream_path: '/',
      upstream_ref: 'abc1234def5678901234567890abcdef12345678',
      fetch_url: 'https://example.com/code-review.tar.gz',
      fetch_kind: 'tarball',
    },
    provenance: {
      source_id: 'wshobson',
      source_repo: 'wshobson/agents',
      source_path: '/',
      vendored_at: '2026-05-16T00:00:00.000Z',
      upstream_license: 'MIT',
      upstream_version_or_commit: 'abc1234def5678901234567890abcdef12345678',
      upstream_license_source: 'LICENSE',
    },
    manifest: {
      schema_version: '1.0.0',
      name: 'code-review',
      version: '1.0.0',
      description: 'Reviews code with best practices',
      kind: 'extension',
      provides: {},
      requires: [],
      compatibility: { min_anvil_version: '0.15.0' },
    },
    blob_sha256:
      'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
    content_dir: 'content/',
    inventory: [],
  }

  it('round-trips a minimal quarantine record', () => {
    const parsed = QuarantineRecord.parse(minimalRecord)
    expect(parsed.quarantine_id).toBe('wshobson-code-review-abc1234')
  })

  it('rejects created_at with non-ISO8601', () => {
    expect(() =>
      QuarantineRecord.parse({ ...minimalRecord, created_at: 'bad' }),
    ).toThrow()
  })

  it('rejects inventory item with unknown role', () => {
    expect(() =>
      QuarantineRecord.parse({
        ...minimalRecord,
        inventory: [
          {
            relpath: 'skills/test.md',
            bytes: 100,
            md5: 'abc123',
            role: 'unknown-role',
            token_estimate: 28,
          },
        ],
      }),
    ).toThrow()
  })
})
