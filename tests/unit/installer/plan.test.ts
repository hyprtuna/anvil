import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { buildInstallPlan } from '../../../src/installer/plan.js'

// These point to the actual repo's skills/agents directories.
// process.cwd() is the worktree root when vitest runs.
const SKILLS_ROOT = join(process.cwd(), 'skills')
const AGENTS_ROOT = join(process.cwd(), 'agents')

describe('buildInstallPlan', () => {
  it('returns 2 adapters when target is both', async () => {
    const plan = await buildInstallPlan({
      cwd: process.cwd(),
      scope: 'project',
      target: 'both',
      config: buildDefaultConfig(),
      skillsRoot: SKILLS_ROOT,
      agentsRoot: AGENTS_ROOT,
    })
    expect(plan.target).toBe('both')
    expect(plan.adapters).toHaveLength(2)
    const names = plan.adapters.map((a) => a.adapterName)
    expect(names).toContain('claude-code')
    expect(names).toContain('opencode')
  })

  it('returns 1 adapter when target is claude-code', async () => {
    const plan = await buildInstallPlan({
      cwd: process.cwd(),
      scope: 'project',
      target: 'claude-code',
      config: buildDefaultConfig(),
      skillsRoot: SKILLS_ROOT,
      agentsRoot: AGENTS_ROOT,
    })
    expect(plan.adapters).toHaveLength(1)
    expect(plan.adapters[0]!.adapterName).toBe('claude-code')
  })

  it('returns 1 adapter when target is opencode', async () => {
    const plan = await buildInstallPlan({
      cwd: process.cwd(),
      scope: 'project',
      target: 'opencode',
      config: buildDefaultConfig(),
      skillsRoot: SKILLS_ROOT,
      agentsRoot: AGENTS_ROOT,
    })
    expect(plan.adapters).toHaveLength(1)
    expect(plan.adapters[0]!.adapterName).toBe('opencode')
  })

  it('totalFiles is sum of all adapter files', async () => {
    const plan = await buildInstallPlan({
      cwd: process.cwd(),
      scope: 'project',
      target: 'both',
      config: buildDefaultConfig(),
      skillsRoot: SKILLS_ROOT,
      agentsRoot: AGENTS_ROOT,
    })
    const sum = plan.adapters.reduce((acc, a) => acc + a.files.length, 0)
    expect(plan.totalFiles).toBe(sum)
    expect(plan.totalFiles).toBeGreaterThan(0)
  })

  it('plan includes plugin.json for claude-code', async () => {
    const plan = await buildInstallPlan({
      cwd: process.cwd(),
      scope: 'project',
      target: 'claude-code',
      config: buildDefaultConfig(),
      skillsRoot: SKILLS_ROOT,
      agentsRoot: AGENTS_ROOT,
    })
    const ccAdapter = plan.adapters.find(
      (a) => a.adapterName === 'claude-code',
    )!
    const paths = ccAdapter.files.map((f) => f.relativePath)
    expect(paths).toContain('.claude-plugin/plugin.json')
  })

  it('plan includes plugins/opencode/package.json for opencode (v2 layout)', async () => {
    const plan = await buildInstallPlan({
      cwd: process.cwd(),
      scope: 'project',
      target: 'opencode',
      config: buildDefaultConfig(),
      skillsRoot: SKILLS_ROOT,
      agentsRoot: AGENTS_ROOT,
    })
    const ocAdapter = plan.adapters.find((a) => a.adapterName === 'opencode')!
    const paths = ocAdapter.files.map((f) => f.relativePath)
    expect(paths).toContain('plugins/opencode/package.json')
  })

  it('scope is reflected in plan', async () => {
    const plan = await buildInstallPlan({
      cwd: process.cwd(),
      scope: 'global',
      target: 'claude-code',
      config: buildDefaultConfig(),
      skillsRoot: SKILLS_ROOT,
      agentsRoot: AGENTS_ROOT,
      home: '/tmp/fake-home',
    })
    expect(plan.scope).toBe('global')
    const ccAdapter = plan.adapters[0]!
    expect(ccAdapter.installRoot).toBe('/tmp/fake-home')
  })
})
