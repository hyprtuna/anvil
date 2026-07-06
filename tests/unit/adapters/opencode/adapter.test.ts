import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

// Mock child_process to avoid real binary checks
vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => {
    throw new Error('not found')
  }),
}))

let tmp: string

beforeAll(() => {
  tmp = createTestTmpDir('oc-adapter')
})

afterAll(() => {
  rmSync(tmp, { recursive: true })
})

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    cwd: tmp,
    scope: 'project' as const,
    config: buildDefaultConfig(),
    skills: [],
    hooks: [],
    agents: [],
    ...overrides,
  }
}

describe('opencodeAdapter.verify', () => {
  it('reports error when plugins/opencode/package.json missing', async () => {
    const { opencodeAdapter } = await import(
      '../../../../src/adapters/opencode/adapter.js'
    )
    const emptyDir = createTestTmpDir('oc-verify-empty')
    try {
      const ctx = makeContext({ cwd: emptyDir })
      const result = await opencodeAdapter.verify(ctx)
      expect(result.ok).toBe(false)
      const errors = result.findings.filter((f) => f.severity === 'error')
      expect(
        errors.some((e) => e.message.includes('plugins/opencode/package.json')),
      ).toBe(true)
    } finally {
      rmSync(emptyDir, { recursive: true })
    }
  })

  it('passes when plugins/opencode/package.json exists (D-07 — models.json not required)', async () => {
    const { opencodeAdapter } = await import(
      '../../../../src/adapters/opencode/adapter.js'
    )
    const dir = createTestTmpDir('oc-verify-ok')
    try {
      mkdirSync(join(dir, 'plugins', 'opencode'), { recursive: true })
      writeFileSync(join(dir, 'plugins', 'opencode', 'package.json'), '{}')
      // models.json intentionally absent — no longer part of verify() (D-07)
      const ctx = makeContext({ cwd: dir })
      const result = await opencodeAdapter.verify(ctx)
      expect(result.ok).toBe(true)
      const errors = result.findings.filter((f) => f.severity === 'error')
      expect(errors).toHaveLength(0)
    } finally {
      rmSync(dir, { recursive: true })
    }
  })

  it('does NOT warn about models.json absence (D-07 — dead artifact finding removed)', async () => {
    const { opencodeAdapter } = await import(
      '../../../../src/adapters/opencode/adapter.js'
    )
    const dir = createTestTmpDir('oc-verify-no-models')
    try {
      mkdirSync(join(dir, 'plugins', 'opencode'), { recursive: true })
      writeFileSync(join(dir, 'plugins', 'opencode', 'package.json'), '{}')
      const ctx = makeContext({ cwd: dir })
      const result = await opencodeAdapter.verify(ctx)
      expect(result.ok).toBe(true)
      const warns = result.findings.filter((f) => f.severity === 'warn')
      expect(warns.some((w) => w.message.includes('models.json'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true })
    }
  })

  it('adapter name is opencode', async () => {
    const { opencodeAdapter } = await import(
      '../../../../src/adapters/opencode/adapter.js'
    )
    expect(opencodeAdapter.name).toBe('opencode')
  })

  it('adapter pins manifest schemaVersion to 1', async () => {
    const { opencodeAdapter } = await import(
      '../../../../src/adapters/opencode/adapter.js'
    )
    expect(opencodeAdapter.schemaVersion).toBe(1)
  })
})
