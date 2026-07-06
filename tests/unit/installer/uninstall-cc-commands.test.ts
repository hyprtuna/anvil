/**
 * S-006 — cc-commands glob-scoped uninstall.
 *
 * Verifies that runUninstallPlan only targets anvil-*.md files in
 * .claude/commands/, leaving user-authored files untouched.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runUninstallPlan } from '../../../src/installer/uninstall.js'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = join(tmpdir(), `anvil-test-uninstall-${Date.now()}`)
  const commandsDir = join(tmpRoot, '.claude', 'commands')
  mkdirSync(commandsDir, { recursive: true })
  writeFileSync(join(commandsDir, 'anvil-foo.md'), '# anvil foo')
  writeFileSync(join(commandsDir, 'anvil-bar.md'), '# anvil bar')
  writeFileSync(join(commandsDir, 'user-custom.md'), '# user custom')
  writeFileSync(join(commandsDir, 'my-workflow.md'), '# my workflow')
})

afterEach(() => {
  // Best-effort cleanup; tmpdir GC handles stragglers.
})

describe('runUninstallPlan cc-commands (S-006)', () => {
  it('only lists anvil-*.md files in willRemove, not user files', () => {
    const plan = runUninstallPlan({ scope: 'project', cwd: tmpRoot })
    const commandFiles = plan.willRemove.filter((p) =>
      p.includes('.claude/commands'),
    )
    const basenames = commandFiles.map((p) => p.split('/').pop())
    expect(basenames).toContain('anvil-foo.md')
    expect(basenames).toContain('anvil-bar.md')
    expect(basenames).not.toContain('user-custom.md')
    expect(basenames).not.toContain('my-workflow.md')
  })

  it('cc-commands target present=true when anvil-*.md files exist', () => {
    const plan = runUninstallPlan({ scope: 'project', cwd: tmpRoot })
    const ccTarget = plan.targets.find((t) => t.id === 'cc-commands')
    expect(ccTarget).toBeDefined()
    expect(ccTarget!.present).toBe(true)
    expect(ccTarget!.paths).toHaveLength(2)
  })

  it('cleanupDirs includes the commands directory', () => {
    const plan = runUninstallPlan({ scope: 'project', cwd: tmpRoot })
    const commandsDir = join(tmpRoot, '.claude', 'commands')
    expect(plan.cleanupDirs).toContain(commandsDir)
  })

  it('returns present=false for cc-commands when dir does not exist', () => {
    const plan = runUninstallPlan({
      scope: 'project',
      cwd: '/tmp/__nonexistent_test_root__',
    })
    const ccTarget = plan.targets.find((t) => t.id === 'cc-commands')
    expect(ccTarget).toBeDefined()
    expect(ccTarget!.present).toBe(false)
    expect(ccTarget!.paths).toHaveLength(0)
  })
})
