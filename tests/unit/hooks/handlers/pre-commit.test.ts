import { execSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { HookResult } from '../../../../src/core/types.js'
import { preCommitHandler } from '../../../../src/hooks/handlers/pre-commit.js'

vi.mock('node:child_process')
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    readFileSync: vi.fn(),
    statSync: vi.fn(),
  }
})

describe('hooks/handlers/pre-commit', () => {
  const ctx = {
    kind: 'pre-commit' as const,
    cwd: '/tmp/fake-project',
    config: buildDefaultConfig(),
    env: {},
    payload: null,
  }

  beforeEach(() => {
    vi.mocked(execSync).mockReset()
    vi.mocked(readFileSync).mockReset()
    vi.mocked(statSync).mockReset()
  })

  it('returns SUCCESS when typecheck passes and no secrets are found', async () => {
    // typecheck + `git diff --cached --name-only` both return empty success
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('typecheck')) return Buffer.from('')
      if (cmd.includes('git diff')) return Buffer.from('src/foo.ts\n')
      return Buffer.from('')
    })
    vi.mocked(statSync).mockReturnValue({
      isFile: () => true,
      size: 100,
    } as unknown as ReturnType<typeof statSync>)
    vi.mocked(readFileSync).mockReturnValue(
      Buffer.from('const greeting = "hello"\n'),
    )

    const r = await preCommitHandler(ctx)
    expect(r.exitCode).toBe(0)
    expect(r.message).toMatch(/typecheck/i)
    expect(r.message).toMatch(/secret-scan/i)
  })

  it('returns BLOCK when typecheck fails', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('typecheck')) throw new Error('TS2322: Type mismatch')
      return Buffer.from('')
    })
    const r = await preCommitHandler(ctx)
    expect(r.exitCode).toBe(2)
    expect(r.message).toMatch(/fail/i)
  })

  it('returns BLOCK when a staged file contains a secret-shaped string', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes('typecheck')) return Buffer.from('')
      if (cmd.includes('git diff')) return Buffer.from('config.env\n')
      return Buffer.from('')
    })
    vi.mocked(statSync).mockReturnValue({
      isFile: () => true,
      size: 200,
    } as unknown as ReturnType<typeof statSync>)
    vi.mocked(readFileSync).mockReturnValue(
      Buffer.from('AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\n'),
    )

    const r = await preCommitHandler(ctx)
    expect(r.exitCode).toBe(2)
    expect(r.message).toMatch(/AWS access key/)
    expect(r.message).toMatch(/config\.env/)
  })
})

// J4: HookResult shape contract
describe('hooks/handlers/pre-commit — HookResult shape', () => {
  it('passes HookResult.parse() for BLOCK result (typecheck fail)', async () => {
    // typecheck fails in /tmp (no package.json), returns BLOCK
    const ctx = {
      kind: 'pre-commit' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: null,
    }
    const r = await preCommitHandler(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })
})
