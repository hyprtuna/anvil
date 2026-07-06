/**
 * ANV-0128 — memory-validator profile coverage.
 *
 * Profile semantics:
 *   minimal — H1 presence only; stub/table/h1-rename checks skipped.
 *   balanced — all current invariants (no behavior change vs ANV-0125).
 *   strict — balanced + reject newly-introduced trailing whitespace.
 *
 * Switching profile changes behavior without re-registering the handler.
 */
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { HookRegistry } from '../../../../src/core/registry/hook-registry.js'
import type { HookKind, ModelsConfig } from '../../../../src/core/types.js'
import { detectInvariantViolations } from '../../../../src/core/validation/memory-file.js'
import { dispatch } from '../../../../src/hooks/dispatcher.js'
import {
  memoryValidatorHandler,
  memoryValidatorProfileManifest,
} from '../../../../src/hooks/handlers/memory-validator.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

let workDir: string

beforeEach(() => {
  workDir = createTestTmpDir('memval-profiles')
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

function makeCtx(
  payload: unknown,
  cfg: ModelsConfig = buildDefaultConfig(),
  profile?: string,
) {
  return {
    kind: 'pre-tool-use' as HookKind,
    cwd: workDir,
    config: cfg,
    env: {} as Record<string, string>,
    payload,
    ...(profile !== undefined ? { profile } : {}),
  }
}

describe('memory-validator profile manifest', () => {
  it('declares minimal/balanced/strict profiles with balanced as default', () => {
    expect(memoryValidatorProfileManifest.defaultProfile).toBe('balanced')
    expect(memoryValidatorProfileManifest.profiles).toMatchObject({
      minimal: expect.any(Object),
      balanced: expect.any(Object),
      strict: expect.any(Object),
    })
  })
})

describe('detectInvariantViolations — minimal profile', () => {
  it('allows table-heading drops on AGENTS.md under minimal', () => {
    const oldContent = [
      '# Folder Guide',
      '',
      '| Path | Purpose |',
      '|---|---|',
      '| a | b |',
      '',
    ].join('\n')
    const newContent = '# Folder Guide\n\nIntro prose.\n'
    const violations = detectInvariantViolations({
      path: '/repo/AGENTS.md',
      oldContent,
      newContent,
      profile: 'minimal',
    })
    expect(violations).toEqual([])
  })

  it('still blocks when H1 is dropped under minimal', () => {
    const violations = detectInvariantViolations({
      path: '/repo/AGENTS.md',
      oldContent: '# Folder Guide\n\nbody.\n',
      newContent: 'body.\n',
      profile: 'minimal',
    })
    expect(violations.map((v) => v.kind)).toEqual(['missing-h1'])
  })

  it('skips stub-parity on CLAUDE.md under minimal', () => {
    const violations = detectInvariantViolations({
      path: '/repo/CLAUDE.md',
      oldContent: '@./AGENTS.md\n',
      newContent: '# CLAUDE Notes\n\nfreeform.\n',
      profile: 'minimal',
      siblingAgentsMdExists: true,
    })
    expect(violations.map((v) => v.kind)).not.toContain('stub-broken')
  })
})

describe('detectInvariantViolations — balanced profile (current behavior)', () => {
  it('blocks dropped table headings (regression guard)', () => {
    const oldContent = [
      '# Folder Guide',
      '',
      '| Path | Purpose |',
      '|---|---|',
      '| a | b |',
      '',
    ].join('\n')
    const newContent = '# Folder Guide\n\nbody.\n'
    const violations = detectInvariantViolations({
      path: '/repo/AGENTS.md',
      oldContent,
      newContent,
      profile: 'balanced',
    })
    expect(violations.map((v) => v.kind)).toContain('table-heading-dropped')
  })

  it('matches current behavior when profile is omitted (default = balanced)', () => {
    const oldContent = [
      '# Folder Guide',
      '',
      '| Path | Purpose |',
      '|---|---|',
      '| a | b |',
      '',
    ].join('\n')
    const newContent = '# Folder Guide\n\nbody.\n'
    const withProfile = detectInvariantViolations({
      path: '/repo/AGENTS.md',
      oldContent,
      newContent,
      profile: 'balanced',
    })
    const withoutProfile = detectInvariantViolations({
      path: '/repo/AGENTS.md',
      oldContent,
      newContent,
    })
    expect(withoutProfile.map((v) => v.kind)).toEqual(
      withProfile.map((v) => v.kind),
    )
  })
})

describe('detectInvariantViolations — strict profile', () => {
  it('flags newly-introduced trailing whitespace', () => {
    const oldContent = '# Folder Guide\n\nbody.\n'
    const newContent = '# Folder Guide\n\nbody.   \nmore.\n'
    const violations = detectInvariantViolations({
      path: '/repo/AGENTS.md',
      oldContent,
      newContent,
      profile: 'strict',
    })
    expect(violations.map((v) => v.kind)).toContain(
      'trailing-whitespace-introduced',
    )
  })

  it('still allows clean edits under strict', () => {
    const oldContent = '# Folder Guide\n\nbody.\n'
    const newContent = '# Folder Guide\n\nbody.\nmore.\n'
    const violations = detectInvariantViolations({
      path: '/repo/AGENTS.md',
      oldContent,
      newContent,
      profile: 'strict',
    })
    expect(violations).toEqual([])
  })

  it('does NOT flag pre-existing trailing whitespace that survives the edit', () => {
    const oldContent = '# Folder Guide\n\nbody.   \n'
    const newContent = '# Folder Guide\n\nbody.   \nmore.\n'
    const violations = detectInvariantViolations({
      path: '/repo/AGENTS.md',
      oldContent,
      newContent,
      profile: 'strict',
    })
    expect(violations.map((v) => v.kind)).not.toContain(
      'trailing-whitespace-introduced',
    )
  })
})

describe('memoryValidatorHandler reads ctx.profile from dispatcher', () => {
  it('allows table-heading drop when active profile = minimal (via config)', async () => {
    const agentsPath = join(workDir, 'AGENTS.md')
    const original = [
      '# Folder Guide',
      '',
      '| Path | Purpose |',
      '|---|---|',
      '| a | b |',
      '',
    ].join('\n')
    writeFileSync(agentsPath, original)
    const cfg = buildDefaultConfig()
    cfg.hooks = {
      ...(cfg.hooks ?? {}),
      'memory-validator': { profile: 'minimal' },
    }
    // Edit drops table headings — would be blocked under balanced.
    const reg = new HookRegistry()
    reg.register('memory-validator', 'pre-tool-use', memoryValidatorHandler, {
      profileManifest: memoryValidatorProfileManifest,
    })
    const result = await dispatch(reg, {
      kind: 'pre-tool-use',
      cwd: workDir,
      config: cfg,
      env: {},
      payload: {
        tool_name: 'Edit',
        tool_input: {
          file_path: agentsPath,
          old_string: original,
          new_string: '# Folder Guide\n\nbody.\n',
        },
      },
    })
    expect(result.exitCode).toBe(0)
  })

  it('blocks the same edit under balanced (default profile)', async () => {
    const agentsPath = join(workDir, 'AGENTS.md')
    const original = [
      '# Folder Guide',
      '',
      '| Path | Purpose |',
      '|---|---|',
      '| a | b |',
      '',
    ].join('\n')
    writeFileSync(agentsPath, original)
    const reg = new HookRegistry()
    reg.register('memory-validator', 'pre-tool-use', memoryValidatorHandler, {
      profileManifest: memoryValidatorProfileManifest,
    })
    const result = await dispatch(reg, {
      kind: 'pre-tool-use',
      cwd: workDir,
      config: buildDefaultConfig(),
      env: {},
      payload: {
        tool_name: 'Edit',
        tool_input: {
          file_path: agentsPath,
          old_string: original,
          new_string: '# Folder Guide\n\nbody.\n',
        },
      },
    })
    expect(result.exitCode).toBe(2)
  })

  it('blocks newly-introduced trailing whitespace under strict', async () => {
    const agentsPath = join(workDir, 'AGENTS.md')
    const original = '# Folder Guide\n\nbody.\n'
    writeFileSync(agentsPath, original)
    const cfg = buildDefaultConfig()
    cfg.hooks = {
      ...(cfg.hooks ?? {}),
      'memory-validator': { profile: 'strict' },
    }
    const reg = new HookRegistry()
    reg.register('memory-validator', 'pre-tool-use', memoryValidatorHandler, {
      profileManifest: memoryValidatorProfileManifest,
    })
    const result = await dispatch(reg, {
      kind: 'pre-tool-use',
      cwd: workDir,
      config: cfg,
      env: {},
      payload: {
        tool_name: 'Edit',
        tool_input: {
          file_path: agentsPath,
          old_string: original,
          new_string: '# Folder Guide\n\nbody.   \n',
        },
      },
    })
    expect(result.exitCode).toBe(2)
  })

  it('legacy invocation (no manifest in registration) still works', async () => {
    // Caller didn't pass profileManifest — handler should behave as balanced
    // because the default profile is detected from the handler itself.
    const agentsPath = join(workDir, 'AGENTS.md')
    const original = '# Folder Guide\n\nbody.\n'
    writeFileSync(agentsPath, original)
    const result = await memoryValidatorHandler(
      makeCtx({
        tool_name: 'Edit',
        tool_input: {
          file_path: agentsPath,
          old_string: 'body.',
          new_string: 'updated body.',
        },
      }),
    )
    expect(result.exitCode).toBe(0)
  })
})
