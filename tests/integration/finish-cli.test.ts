import { describe, expect, it } from 'vitest'
import {
  determineBaseBranch,
  resolveFinishMode,
} from '../../src/commands/cli/finish.js'
import { loadAllSkills } from '../../src/skills/load-all.js'

describe('integration: anvil finish (Plan 31 E5)', () => {
  describe('finishing-branch skill', () => {
    it('finishing-branch skill loads from skills registry', async () => {
      const reg = await loadAllSkills({ skillsRoot: 'skills' })
      const names = reg.getAll().map((s) => s.frontmatter.name)
      expect(names).toContain('finishing-branch')
    })

    it('finishing-branch is not user-invocable', async () => {
      const reg = await loadAllSkills({ skillsRoot: 'skills' })
      const skill = reg
        .getAll()
        .find((s) => s.frontmatter.name === 'finishing-branch')
      expect(skill).toBeDefined()
      expect(skill!.frontmatter.userInvocable).toBe(false)
    })

    it('finishing-branch skill body documents the 4-option menu', async () => {
      const reg = await loadAllSkills({ skillsRoot: 'skills' })
      const skill = reg
        .getAll()
        .find((s) => s.frontmatter.name === 'finishing-branch')
      expect(skill).toBeDefined()
      expect(skill!.body).toContain('pull request')
      expect(skill!.body).toContain('Merge into')
      expect(skill!.body).toContain('Keep branch')
      expect(skill!.body).toContain('Discard')
    })

    it('finishing-branch skill body documents the test gate requirement', async () => {
      const reg = await loadAllSkills({ skillsRoot: 'skills' })
      const skill = reg
        .getAll()
        .find((s) => s.frontmatter.name === 'finishing-branch')
      expect(skill).toBeDefined()
      // Verification gate must be present
      expect(skill!.body).toContain('Verification Gate')
      // Must block on failure
      expect(skill!.body).toContain('STOP')
    })
  })

  describe('finish CLI command', () => {
    it('resolves all 4 valid modes', () => {
      expect(resolveFinishMode('merge')).toBe('merge')
      expect(resolveFinishMode('pr')).toBe('pr')
      expect(resolveFinishMode('keep')).toBe('keep')
      expect(resolveFinishMode('discard')).toBe('discard')
    })

    it('returns null for unknown mode (triggers interactive menu)', () => {
      expect(resolveFinishMode('squash')).toBeNull()
      expect(resolveFinishMode(undefined)).toBeNull()
    })

    it('detects main as base branch when available', async () => {
      const exec = async (cmd: string) => {
        if (cmd.includes('main')) return { stdout: 'abc\n', stderr: '' }
        throw new Error('not found')
      }
      expect(await determineBaseBranch(exec)).toBe('main')
    })

    it('falls back to master when main is not available', async () => {
      const exec = async (cmd: string) => {
        if (cmd.includes('master')) return { stdout: 'def\n', stderr: '' }
        throw new Error('not found')
      }
      expect(await determineBaseBranch(exec)).toBe('master')
    })

    it('returns null when neither main nor master exist', async () => {
      const exec = async (): Promise<{ stdout: string; stderr: string }> => {
        throw new Error('no git')
      }
      expect(await determineBaseBranch(exec)).toBeNull()
    })
  })

  describe('slash parity', () => {
    it('finish.md slash command exists', async () => {
      const { readFile } = await import('node:fs/promises')
      const content = await readFile('src/commands/slash/finish.md', 'utf-8')
      expect(content).toBeTruthy()
      expect(content).toContain('anvil finish')
    })
  })
})
