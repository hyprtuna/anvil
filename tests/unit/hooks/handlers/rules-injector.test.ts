import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { HookResult } from '../../../../src/core/types.js'
import { rulesInjectorHandler } from '../../../../src/hooks/handlers/rules-injector.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

describe('hooks/handlers/rules-injector (adopted from oh-my-openagent)', () => {
  let root: string

  beforeEach(() => {
    root = createTestTmpDir('rules-inject')
  })
  it('walks up to find the nearest CLAUDE.md and injects its contents', async () => {
    // given: a nested file with a CLAUDE.md one directory above it
    const subdir = join(root, 'src', 'pkg')
    mkdirSync(subdir, { recursive: true })
    const claudeMd = '# rules\n- be concise\n'
    writeFileSync(join(root, 'src', 'CLAUDE.md'), claudeMd, 'utf8')
    const filePath = join(subdir, 'index.ts')
    writeFileSync(filePath, 'export const x = 1\n', 'utf8')

    // when: the hook runs with that file in the payload
    const result = await rulesInjectorHandler({
      kind: 'post-tool-use',
      cwd: root,
      config: buildDefaultConfig(),
      env: {},
      payload: { file: filePath },
    })

    // then: the handler exits success and surfaces rules in context
    expect(result.exitCode).toBe(0)
    expect(result.context?.rulesFile).toBe(join(root, 'src', 'CLAUDE.md'))
    expect(result.context?.rules).toContain('be concise')
  })

  it('prefers AGENTS.md when both AGENTS.md and CLAUDE.md exist at same level', async () => {
    const subdir = join(root, 'app')
    mkdirSync(subdir, { recursive: true })
    writeFileSync(join(subdir, 'CLAUDE.md'), 'claude rules\n', 'utf8')
    writeFileSync(join(subdir, 'AGENTS.md'), 'agents rules\n', 'utf8')
    const filePath = join(subdir, 'main.ts')
    writeFileSync(filePath, 'x', 'utf8')

    const result = await rulesInjectorHandler({
      kind: 'post-tool-use',
      cwd: root,
      config: buildDefaultConfig(),
      env: {},
      payload: { file: filePath },
    })

    expect(result.exitCode).toBe(0)
    expect(result.context?.rulesFile).toBe(join(subdir, 'AGENTS.md'))
    expect(result.context?.rules).toContain('agents rules')
  })

  it('returns exitCode 0 with no rules context when no rules file is found', async () => {
    const subdir = join(root, 'lone')
    mkdirSync(subdir, { recursive: true })
    const filePath = join(subdir, 'orphan.ts')
    writeFileSync(filePath, 'x', 'utf8')

    const result = await rulesInjectorHandler({
      kind: 'post-tool-use',
      cwd: subdir,
      config: buildDefaultConfig(),
      env: {},
      payload: { file: filePath },
    })

    expect(result.exitCode).toBe(0)
    expect(result.context?.rules).toBeUndefined()
    expect(result.context?.rulesFile).toBeUndefined()
  })

  it('stays within the provided cwd (does not walk above it)', async () => {
    // given: CLAUDE.md exists ABOVE the cwd boundary — handler must not read it
    writeFileSync(join(root, 'CLAUDE.md'), 'outside rules\n', 'utf8')
    const inner = join(root, 'workspace')
    mkdirSync(inner, { recursive: true })
    const filePath = join(inner, 'f.ts')
    writeFileSync(filePath, 'x', 'utf8')

    const result = await rulesInjectorHandler({
      kind: 'post-tool-use',
      cwd: inner,
      config: buildDefaultConfig(),
      env: {},
      payload: { file: filePath },
    })

    expect(result.exitCode).toBe(0)
    expect(result.context?.rules).toBeUndefined()
  })

  it('returns exitCode 0 with no context when payload has no file', async () => {
    const result = await rulesInjectorHandler({
      kind: 'post-tool-use',
      cwd: root,
      config: buildDefaultConfig(),
      env: {},
      payload: {},
    })
    expect(result.exitCode).toBe(0)
    expect(result.context?.rules).toBeUndefined()
  })

  it('truncates very long rules content', async () => {
    const subdir = join(root, 'big')
    mkdirSync(subdir, { recursive: true })
    const huge = 'x'.repeat(20_000)
    writeFileSync(join(subdir, 'CLAUDE.md'), huge, 'utf8')
    const filePath = join(subdir, 'f.ts')
    writeFileSync(filePath, 'x', 'utf8')

    const result = await rulesInjectorHandler({
      kind: 'post-tool-use',
      cwd: subdir,
      config: buildDefaultConfig(),
      env: {},
      payload: { file: filePath },
    })

    expect(result.exitCode).toBe(0)
    const rules = result.context?.rules as string
    expect(rules.length).toBeLessThanOrEqual(8_192)
    expect(result.context?.rulesTruncated).toBe(true)
  })
})

// J4: HookResult shape contract
describe('hooks/handlers/rules-injector — HookResult shape', () => {
  it('passes HookResult.parse() for no-file path', async () => {
    const ctx = {
      kind: 'rules-injector' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: null,
    }
    const r = await rulesInjectorHandler(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('passes HookResult.parse() for no-rules-found path', async () => {
    const ctx = {
      kind: 'rules-injector' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: { file: '/tmp/some-file.ts' },
    }
    const r = await rulesInjectorHandler(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })
})
