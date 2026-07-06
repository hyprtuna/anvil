import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveLintRoots } from '../../../src/core/lint-roots.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

describe('resolveLintRoots', () => {
  it('returns empty array when no roots exist (no .claude/skills, no ~/.anvil/skills)', async () => {
    const tmp = createTestTmpDir('lint-roots-empty')
    try {
      const roots = resolveLintRoots({
        kind: 'skill',
        cwd: tmp,
        anvilHome: join(tmp, 'fake-home', '.anvil'),
      })
      expect(roots).toEqual([])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('returns cwd-only root when .claude/skills exists but no anvilHome/skills', async () => {
    const tmp = createTestTmpDir('lint-roots-cwd-only')
    try {
      const cwdSkillsDir = join(tmp, '.claude', 'skills')
      await mkdir(cwdSkillsDir, { recursive: true })

      const roots = resolveLintRoots({
        kind: 'skill',
        cwd: tmp,
        anvilHome: join(tmp, 'fake-home', '.anvil'),
      })

      expect(roots).toHaveLength(1)
      expect(roots[0]).toEqual({ kind: 'skill', root: cwdSkillsDir })
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('returns home-only root when anvilHome/skills exists but no .claude/skills', async () => {
    const tmp = createTestTmpDir('lint-roots-home-only')
    try {
      const homeSkillsDir = join(tmp, 'fake-home', '.anvil', 'skills')
      await mkdir(homeSkillsDir, { recursive: true })

      const roots = resolveLintRoots({
        kind: 'skill',
        cwd: tmp,
        anvilHome: join(tmp, 'fake-home', '.anvil'),
      })

      expect(roots).toHaveLength(1)
      expect(roots[0]).toEqual({ kind: 'skill', root: homeSkillsDir })
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('returns both roots when both exist (cwd first)', async () => {
    const tmp = createTestTmpDir('lint-roots-both')
    try {
      const cwdSkillsDir = join(tmp, '.claude', 'skills')
      const homeSkillsDir = join(tmp, 'fake-home', '.anvil', 'skills')
      await mkdir(cwdSkillsDir, { recursive: true })
      await mkdir(homeSkillsDir, { recursive: true })

      const roots = resolveLintRoots({
        kind: 'skill',
        cwd: tmp,
        anvilHome: join(tmp, 'fake-home', '.anvil'),
      })

      expect(roots).toHaveLength(2)
      expect(roots[0]).toEqual({ kind: 'skill', root: cwdSkillsDir })
      expect(roots[1]).toEqual({ kind: 'skill', root: homeSkillsDir })
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('explicit target overrides defaults when path exists', async () => {
    const tmp = createTestTmpDir('lint-roots-target')
    try {
      const targetDir = join(tmp, 'my-pack', 'skills')
      await mkdir(targetDir, { recursive: true })

      // Even if .claude/skills and anvilHome/skills also exist, target wins
      const cwdSkillsDir = join(tmp, '.claude', 'skills')
      await mkdir(cwdSkillsDir, { recursive: true })

      const roots = resolveLintRoots({
        kind: 'skill',
        cwd: tmp,
        anvilHome: join(tmp, 'fake-home', '.anvil'),
        target: targetDir,
      })

      expect(roots).toHaveLength(1)
      expect(roots[0]).toEqual({ kind: 'skill', root: targetDir })
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('throws when explicit target path does not exist', () => {
    const tmp = createTestTmpDir('lint-roots-invalid-target')
    expect(() =>
      resolveLintRoots({
        kind: 'skill',
        cwd: tmp,
        anvilHome: join(tmp, '.anvil'),
        target: join(tmp, 'nonexistent', 'path'),
      }),
    ).toThrow()
  })

  it('resolves agent kind to agents directory', async () => {
    const tmp = createTestTmpDir('lint-roots-agent')
    try {
      const cwdAgentsDir = join(tmp, '.claude', 'agents')
      await mkdir(cwdAgentsDir, { recursive: true })

      const roots = resolveLintRoots({
        kind: 'agent',
        cwd: tmp,
        anvilHome: join(tmp, '.anvil'),
      })

      expect(roots).toHaveLength(1)
      expect(roots[0]).toEqual({ kind: 'agent', root: cwdAgentsDir })
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('resolves hook kind to hooks directory', async () => {
    const tmp = createTestTmpDir('lint-roots-hook')
    try {
      const cwdHooksDir = join(tmp, '.claude', 'hooks')
      await mkdir(cwdHooksDir, { recursive: true })

      const roots = resolveLintRoots({
        kind: 'hook',
        cwd: tmp,
        anvilHome: join(tmp, '.anvil'),
      })

      expect(roots).toHaveLength(1)
      expect(roots[0]).toEqual({ kind: 'hook', root: cwdHooksDir })
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
