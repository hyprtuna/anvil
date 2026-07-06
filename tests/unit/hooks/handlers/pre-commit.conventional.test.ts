import { execSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { preCommitHandler } from '../../../../src/hooks/handlers/pre-commit.js'

vi.mock('node:child_process')
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    readFileSync: vi.fn(),
    statSync: vi.fn(),
    existsSync: vi.fn(),
  }
})

describe('hooks/handlers/pre-commit — Conventional Commits (opt-in)', () => {
  const ctx = {
    kind: 'pre-commit' as const,
    cwd: '/tmp/fake-project',
    config: buildDefaultConfig(),
    env: {} as Record<string, string>,
    payload: null,
  }

  beforeEach(() => {
    vi.mocked(execSync).mockReset()
    vi.mocked(readFileSync).mockReset()
    vi.mocked(statSync).mockReset()
    vi.mocked(existsSync).mockReset()
    process.env.ANVIL_ENFORCE_CONVENTIONAL_COMMITS = undefined
  })
  afterEach(() => {
    process.env.ANVIL_ENFORCE_CONVENTIONAL_COMMITS = undefined
  })

  function setupCleanProject() {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('typecheck')) return Buffer.from('')
      if (cmd.includes('git diff')) return Buffer.from('')
      return Buffer.from('')
    })
  }

  it('default (flag unset) — does NOT inspect COMMIT_EDITMSG and returns SUCCESS', async () => {
    setupCleanProject()
    vi.mocked(existsSync).mockImplementation(() => false)

    const r = await preCommitHandler(ctx)
    expect(r.exitCode).toBe(0)
    expect(r.message).not.toMatch(/conventional/i)
  })

  it('opt-in + non-conforming subject — BLOCKs with helpful message', async () => {
    process.env.ANVIL_ENFORCE_CONVENTIONAL_COMMITS = '1'
    setupCleanProject()
    vi.mocked(existsSync).mockImplementation((p) =>
      String(p).endsWith('COMMIT_EDITMSG'),
    )
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).endsWith('COMMIT_EDITMSG'))
        return Buffer.from('updating stuff\n')
      return Buffer.from('')
    })

    const r = await preCommitHandler(ctx)
    expect(r.exitCode).toBe(2)
    expect(r.message).toMatch(/conventional/i)
  })

  it('opt-in + conforming subject — returns SUCCESS', async () => {
    process.env.ANVIL_ENFORCE_CONVENTIONAL_COMMITS = '1'
    setupCleanProject()
    vi.mocked(existsSync).mockImplementation((p) =>
      String(p).endsWith('COMMIT_EDITMSG'),
    )
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).endsWith('COMMIT_EDITMSG'))
        return Buffer.from('feat(commands): add new note command\n')
      return Buffer.from('')
    })

    const r = await preCommitHandler(ctx)
    expect(r.exitCode).toBe(0)
    expect(r.message).toMatch(/commit-msg: ok/)
  })

  it('opt-in + subject > 72 chars — BLOCKs', async () => {
    process.env.ANVIL_ENFORCE_CONVENTIONAL_COMMITS = '1'
    setupCleanProject()
    vi.mocked(existsSync).mockImplementation((p) =>
      String(p).endsWith('COMMIT_EDITMSG'),
    )
    const long = `feat: ${'x'.repeat(80)}`
    vi.mocked(readFileSync).mockImplementation((p) => {
      if (String(p).endsWith('COMMIT_EDITMSG')) return Buffer.from(`${long}\n`)
      return Buffer.from('')
    })

    const r = await preCommitHandler(ctx)
    expect(r.exitCode).toBe(2)
    expect(r.message).toMatch(/72/)
  })
})
