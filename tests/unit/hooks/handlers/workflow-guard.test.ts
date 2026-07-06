import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { HookResult } from '../../../../src/core/types.js'
import { workflowGuardHandler } from '../../../../src/hooks/handlers/workflow-guard.js'

const TEST_CWD = join('/tmp', 'anvil-workflow-guard-test')

function makeCtx(payload: unknown, cwd = TEST_CWD) {
  return {
    kind: 'workflow-guard' as const,
    cwd,
    config: buildDefaultConfig(),
    env: {},
    payload,
  }
}

describe('hooks/handlers/workflow-guard', () => {
  beforeEach(() => {
    // Clean up any previous test state
    rmSync(TEST_CWD, { recursive: true, force: true })
    mkdirSync(TEST_CWD, { recursive: true })
  })

  afterEach(() => {
    rmSync(TEST_CWD, { recursive: true, force: true })
  })

  it('returns OK when not a source file', async () => {
    const r = await workflowGuardHandler(
      makeCtx({
        filePath: 'README.md',
      }),
    )
    expect(r.exitCode).toBe(0)
    expect(r.message).toContain('no workflow required')
  })

  it('returns OK for config files', async () => {
    const r = await workflowGuardHandler(
      makeCtx({
        filePath: 'package.json',
      }),
    )
    expect(r.exitCode).toBe(0)
  })

  it('returns OK for dotfiles', async () => {
    const r = await workflowGuardHandler(
      makeCtx({
        filePath: '.gitignore',
      }),
    )
    expect(r.exitCode).toBe(0)
  })

  it('returns warning for source file edits without workflow', async () => {
    const r = await workflowGuardHandler(
      makeCtx({
        filePath: 'src/core/types.ts',
      }),
    )
    expect(r.exitCode).toBe(1)
    expect(r.message).toContain('WARNING')
    expect(r.message).toContain('anvil quick')
    expect(r.context).toMatchObject({
      isSourceFile: true,
      hasActiveWorkflow: false,
      severity: 'warning',
    })
  })

  it('returns OK for source file edits with active workflow', async () => {
    // Create active workflow file
    const statePath = join(TEST_CWD, '.anvil', 'state')
    mkdirSync(statePath, { recursive: true })
    writeFileSync(join(statePath, 'active-workflow.json'), '{"id":"test"}')

    const r = await workflowGuardHandler(
      makeCtx({
        filePath: 'src/core/types.ts',
      }),
    )
    expect(r.exitCode).toBe(0)
    expect(r.message).toContain('active workflow detected')
    expect(r.context).toMatchObject({ hasActiveWorkflow: true })
  })

  it('handles null payload gracefully', async () => {
    const r = await workflowGuardHandler(makeCtx(null))
    expect(r.exitCode).toBe(0)
  })
})

// J4: HookResult shape contract
describe('hooks/handlers/workflow-guard — HookResult shape', () => {
  it('passes HookResult.parse() for non-source file', async () => {
    const ctx = {
      kind: 'workflow-guard' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: { filePath: 'README.md' },
    }
    const r = await workflowGuardHandler(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('passes HookResult.parse() for source file (no workflow)', async () => {
    const ctx = {
      kind: 'workflow-guard' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: { filePath: 'src/app.ts' },
    }
    const r = await workflowGuardHandler(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('passes HookResult.parse() for null payload', async () => {
    const ctx = {
      kind: 'workflow-guard' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: null,
    }
    const r = await workflowGuardHandler(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })
})
