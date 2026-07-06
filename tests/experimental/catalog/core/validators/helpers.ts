/**
 * ANV-0028 (P3) — Test fixtures for validator tests.
 */

import type { QuarantineRecord } from '../../../../../src/experimental/catalog/core/types.js'
import type { ValidatorContext } from '../../../../../src/experimental/catalog/core/validators/index.js'
import { DEFAULT_TOKEN_BUDGET } from '../../../../../src/experimental/catalog/core/validators/token-budget.js'

/** Build a minimal but fully valid QuarantineRecord fixture. */
export function makeFixtureRecord(
  overrides: Partial<QuarantineRecord> = {},
): QuarantineRecord {
  return {
    quarantine_id: 'wshobson-my-extension-abc1234',
    schema_version: '1.0.0',
    created_at: '2026-05-16T00:00:00.000Z',
    source: {
      id: 'wshobson',
      display_name: 'Wshobson Extensions',
      index_url: 'https://example.com/index.json',
      trust_tier: 'community',
    },
    index_entry: {
      slug: 'my-extension',
      display_name: 'My Extension',
      description: 'Use when you need a great extension for testing purposes.',
      upstream_repo: 'wshobson/extensions',
      upstream_path: '/my-extension',
      upstream_ref: 'v1.0.0',
      fetch_url: 'https://example.com/my-extension.tar.gz',
      fetch_kind: 'tarball',
    },
    provenance: {
      source_id: 'wshobson',
      source_repo: 'wshobson/extensions',
      source_path: '/my-extension',
      vendored_at: '2026-05-16T00:00:00.000Z',
      upstream_license: 'MIT',
      upstream_version_or_commit: 'v1.0.0',
      upstream_license_source: 'declared',
    },
    manifest: {
      schema_version: '1.0.0',
      name: 'my-extension',
      version: '1.0.0',
      description: 'Use when you need a great extension for testing purposes.',
      kind: 'extension',
      provides: {
        skill: ['my-skill'],
      },
      requires: [],
      compatibility: {
        min_anvil_version: '0.15.0',
      },
    },
    blob_sha256:
      'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
    content_dir: 'content/',
    inventory: [
      {
        relpath: 'skills/my-skill.md',
        bytes: 350,
        md5: 'aabbccddeeff00112233445566778899',
        role: 'skill',
        token_estimate: 100,
      },
    ],
    ...overrides,
  }
}

/** Build a minimal ValidatorContext for tests. */
export function makeCtx(
  anvilHome: string,
  overrides: Partial<ValidatorContext> = {},
): ValidatorContext {
  return {
    anvilHome,
    bundled: {
      skill: new Set<string>(),
      agent: new Set<string>(),
      hook: new Set<string>(),
      command: new Set<string>(),
    },
    promotedInventoryMd5: new Set<string>(),
    candidateBatch: [],
    tokenBudget: DEFAULT_TOKEN_BUDGET,
    ...overrides,
  }
}
