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
  tmp = createTestTmpDir('cc-adapter')
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

describe('claudeCodeAdapter.verify', () => {
  it('reports error when plugin.json missing', async () => {
    const { claudeCodeAdapter } = await import(
      '../../../../src/adapters/claude-code/adapter.js'
    )
    const emptyDir = createTestTmpDir('verify-empty')
    try {
      const ctx = makeContext({ cwd: emptyDir })
      const result = await claudeCodeAdapter.verify(ctx)
      expect(result.ok).toBe(false)
      const errors = result.findings.filter((f) => f.severity === 'error')
      expect(errors.some((e) => e.message.includes('plugin.json'))).toBe(true)
    } finally {
      rmSync(emptyDir, { recursive: true })
    }
  })

  it('passes when plugin.json exists', async () => {
    const { claudeCodeAdapter } = await import(
      '../../../../src/adapters/claude-code/adapter.js'
    )
    const dir = createTestTmpDir('verify-ok')
    try {
      mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
      mkdirSync(join(dir, '.claude'), { recursive: true })
      writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), '{}')
      writeFileSync(join(dir, '.claude', 'models.json'), '{}')
      const ctx = makeContext({ cwd: dir })
      const result = await claudeCodeAdapter.verify(ctx)
      expect(result.ok).toBe(true)
      const errors = result.findings.filter((f) => f.severity === 'error')
      expect(errors).toHaveLength(0)
    } finally {
      rmSync(dir, { recursive: true })
    }
  })

  it('warns but does not fail when models.json missing', async () => {
    const { claudeCodeAdapter } = await import(
      '../../../../src/adapters/claude-code/adapter.js'
    )
    const dir = createTestTmpDir('verify-warn')
    try {
      mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
      writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), '{}')
      const ctx = makeContext({ cwd: dir })
      const result = await claudeCodeAdapter.verify(ctx)
      expect(result.ok).toBe(true)
      const warns = result.findings.filter((f) => f.severity === 'warn')
      expect(warns.some((w) => w.message.includes('models.json'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true })
    }
  })

  it('adapter name is claude-code', async () => {
    const { claudeCodeAdapter } = await import(
      '../../../../src/adapters/claude-code/adapter.js'
    )
    expect(claudeCodeAdapter.name).toBe('claude-code')
  })

  it('adapter pins manifest schemaVersion to 1', async () => {
    const { claudeCodeAdapter } = await import(
      '../../../../src/adapters/claude-code/adapter.js'
    )
    expect(claudeCodeAdapter.schemaVersion).toBe(1)
  })
})
