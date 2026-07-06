import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/installer/wire-claude-code.js', () => ({
  wireClaudeCodeUser: vi.fn(async () => ({
    mode: 'filesystem',
    actions: ['cc-user-wired'],
  })),
  wireClaudeCodeProject: vi.fn(async () => ({
    mode: 'filesystem',
    actions: ['cc-project-wired'],
  })),
  unwireClaudeCodeUser: vi.fn(async () => ({
    mode: 'filesystem',
    actions: ['cc-user-unwired'],
  })),
  unwireClaudeCodeProject: vi.fn(async () => ({
    mode: 'filesystem',
    actions: ['cc-project-unwired'],
  })),
}))

vi.mock('../../src/installer/wire-opencode.js', () => ({
  wireOpenCodeUser: vi.fn(async () => ({
    mode: 'filesystem',
    actions: ['oc-user-wired'],
  })),
  wireOpenCodeProject: vi.fn(async () => ({
    mode: 'filesystem',
    actions: ['oc-project-wired'],
  })),
  unwireOpenCodeUser: vi.fn(async () => ({
    mode: 'filesystem',
    actions: ['oc-user-unwired'],
  })),
  unwireOpenCodeProject: vi.fn(async () => ({
    mode: 'filesystem',
    actions: ['oc-project-unwired'],
  })),
}))

import {
  unwireClaudeCodeProject,
  unwireClaudeCodeUser,
  wireClaudeCodeProject,
  wireClaudeCodeUser,
} from '../../src/installer/wire-claude-code.js'
import {
  unwireOpenCodeProject,
  unwireOpenCodeUser,
  wireOpenCodeProject,
  wireOpenCodeUser,
} from '../../src/installer/wire-opencode.js'
import {
  type Target,
  applyTargets,
  unapplyTargets,
} from '../../src/installer/wire.js'

const FAKE_OPTS = {
  anvilHome: '/fake/anvil-home',
  projectRoot: '/fake/project',
}

describe('applyTargets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs all four targets and returns result for each', async () => {
    const all: Target[] = ['cc-user', 'cc-project', 'oc-user', 'oc-project']
    const result = await applyTargets(all, FAKE_OPTS)

    expect(result['cc-user']).toBeDefined()
    expect(result['cc-project']).toBeDefined()
    expect(result['oc-user']).toBeDefined()
    expect(result['oc-project']).toBeDefined()

    expect(result['cc-user']?.actions).toEqual(['cc-user-wired'])
    expect(result['cc-project']?.actions).toEqual(['cc-project-wired'])
    expect(result['oc-user']?.actions).toEqual(['oc-user-wired'])
    expect(result['oc-project']?.actions).toEqual(['oc-project-wired'])
  })

  it('with subset only calls relevant functions', async () => {
    const subset: Target[] = ['cc-user', 'oc-user']
    const result = await applyTargets(subset, FAKE_OPTS)

    expect(result['cc-user']).toBeDefined()
    expect(result['oc-user']).toBeDefined()
    expect(result['cc-project']).toBeUndefined()
    expect(result['oc-project']).toBeUndefined()

    expect(vi.mocked(wireClaudeCodeUser)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(wireClaudeCodeProject)).not.toHaveBeenCalled()
    expect(vi.mocked(wireOpenCodeUser)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(wireOpenCodeProject)).not.toHaveBeenCalled()
  })

  it('passes opts to each wire function', async () => {
    await applyTargets(['cc-user'], FAKE_OPTS)
    expect(vi.mocked(wireClaudeCodeUser)).toHaveBeenCalledWith(FAKE_OPTS)
  })
})

describe('unapplyTargets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls the unwire functions and returns unwire action strings', async () => {
    const all: Target[] = ['cc-user', 'cc-project', 'oc-user', 'oc-project']
    const result = await unapplyTargets(all, FAKE_OPTS)

    expect(result['cc-user']?.actions).toEqual(['cc-user-unwired'])
    expect(result['cc-project']?.actions).toEqual(['cc-project-unwired'])
    expect(result['oc-user']?.actions).toEqual(['oc-user-unwired'])
    expect(result['oc-project']?.actions).toEqual(['oc-project-unwired'])

    expect(vi.mocked(unwireClaudeCodeUser)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(unwireClaudeCodeProject)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(unwireOpenCodeUser)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(unwireOpenCodeProject)).toHaveBeenCalledTimes(1)
  })

  it('with subset only calls relevant unwire functions', async () => {
    const subset: Target[] = ['oc-project']
    await unapplyTargets(subset, FAKE_OPTS)

    expect(vi.mocked(unwireOpenCodeProject)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(unwireClaudeCodeUser)).not.toHaveBeenCalled()
    expect(vi.mocked(unwireClaudeCodeProject)).not.toHaveBeenCalled()
    expect(vi.mocked(unwireOpenCodeUser)).not.toHaveBeenCalled()
  })
})
