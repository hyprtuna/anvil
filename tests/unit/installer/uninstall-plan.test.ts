import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runUninstallPlan } from '../../../src/installer/uninstall.js'

// Use a fake home/cwd that doesn't exist so existsSync always returns false
const FAKE_HOME = '/tmp/__anvil_test_fake_home_does_not_exist__'
const FAKE_CWD = '/tmp/__anvil_test_fake_cwd_does_not_exist__'

describe('runUninstallPlan', () => {
  it('returns correct shape with scope=project', () => {
    const plan = runUninstallPlan({ scope: 'project', cwd: FAKE_CWD })
    expect(plan.scope).toBe('project')
    expect(Array.isArray(plan.targets)).toBe(true)
    expect(Array.isArray(plan.willRemove)).toBe(true)
    // Since the fake path doesn't exist, nothing is present
    expect(plan.willRemove).toHaveLength(0)
  })

  it('returns correct shape with scope=global', () => {
    const plan = runUninstallPlan({ scope: 'global', home: FAKE_HOME })
    expect(plan.scope).toBe('global')
    expect(plan.willRemove).toHaveLength(0)
  })

  it('targets include expected ids', () => {
    const plan = runUninstallPlan({ scope: 'project', cwd: FAKE_CWD })
    const ids = plan.targets.map((t) => t.id)
    expect(ids).toContain('anvil-home')
    expect(ids).toContain('cc-plugin')
    expect(ids).toContain('cc-skills')
    expect(ids).toContain('oc-plugin')
    expect(ids).toContain('oc-legacy')
  })

  it('each non-glob-scoped target has paths array with at least one entry', () => {
    const plan = runUninstallPlan({ scope: 'project', cwd: FAKE_CWD })
    // cc-commands is glob-scoped: when the dir doesn't exist its paths array is empty.
    const nonGlob = plan.targets.filter((t) => t.id !== 'cc-commands')
    for (const target of nonGlob) {
      expect(target.paths.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('targets rooted under cwd when scope=project', () => {
    const plan = runUninstallPlan({ scope: 'project', cwd: FAKE_CWD })
    for (const target of plan.targets) {
      for (const p of target.paths) {
        expect(p.startsWith(FAKE_CWD)).toBe(true)
      }
    }
  })

  it('targets rooted under home when scope=global', () => {
    const plan = runUninstallPlan({ scope: 'global', home: FAKE_HOME })
    for (const target of plan.targets) {
      for (const p of target.paths) {
        expect(p.startsWith(FAKE_HOME)).toBe(true)
      }
    }
  })

  it('present=false for every target when cwd does not exist', () => {
    const plan = runUninstallPlan({ scope: 'project', cwd: FAKE_CWD })
    for (const target of plan.targets) {
      expect(target.present).toBe(false)
    }
  })

  it('willRemove only contains paths where present=true', () => {
    const plan = runUninstallPlan({ scope: 'project', cwd: FAKE_CWD })
    const presentPaths = plan.targets
      .filter((t) => t.present)
      .flatMap((t) => t.paths)
    expect(plan.willRemove).toEqual(presentPaths)
  })

  it('uses process.cwd() when cwd not provided and scope=project', () => {
    const plan = runUninstallPlan({ scope: 'project' })
    // Just verify it doesn't throw and returns valid shape
    expect(plan.scope).toBe('project')
    expect(Array.isArray(plan.targets)).toBe(true)
  })

  it('anvil-home target path is <root>/.anvil', () => {
    const plan = runUninstallPlan({ scope: 'project', cwd: FAKE_CWD })
    const anvilHome = plan.targets.find((t) => t.id === 'anvil-home')
    expect(anvilHome).toBeDefined()
    expect(anvilHome!.paths[0]).toBe(join(FAKE_CWD, '.anvil'))
  })

  // ---------------------------------------------------------------------------
  // Global scope preserves user data under ~/.anvil/ on uninstall.
  // projects/, sessions/, preferences.json, and logs/ MUST NOT be enumerated
  // as removal targets. Only install-managed subpaths are removed.
  // ---------------------------------------------------------------------------
  describe('scope=global preserves user data under ~/.anvil/', () => {
    it('does not enumerate a single anvil-home target that would nuke everything', () => {
      const plan = runUninstallPlan({ scope: 'global', home: FAKE_HOME })
      const monolithic = plan.targets.find(
        (t) =>
          t.id === 'anvil-home' && t.paths[0] === join(FAKE_HOME, '.anvil'),
      )
      expect(monolithic).toBeUndefined()
    })

    it('enumerates each install-managed subpath as its own target', () => {
      const plan = runUninstallPlan({ scope: 'global', home: FAKE_HOME })
      const ids = plan.targets.map((t) => t.id)
      for (const id of [
        'anvil-home-agents',
        'anvil-home-bin',
        'anvil-home-claude-plugin',
        'anvil-home-commands',
        'anvil-home-hooks',
        'anvil-home-plugins',
        'anvil-home-runtime',
        'anvil-home-skills',
        'anvil-home-templates',
        'anvil-home-models',
        'anvil-home-version',
      ]) {
        expect(ids).toContain(id)
      }
    })

    it('never lists projects/, sessions/, preferences.json, or logs/ as a removal target', () => {
      const plan = runUninstallPlan({ scope: 'global', home: FAKE_HOME })
      const allPaths = plan.targets.flatMap((t) => t.paths)
      for (const preserved of [
        join(FAKE_HOME, '.anvil', 'projects'),
        join(FAKE_HOME, '.anvil', 'sessions'),
        join(FAKE_HOME, '.anvil', 'preferences.json'),
        join(FAKE_HOME, '.anvil', 'logs'),
      ]) {
        expect(allPaths).not.toContain(preserved)
      }
    })
  })
})
