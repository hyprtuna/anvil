import { describe, expect, it } from 'vitest'
import {
  determineBaseBranch,
  resolveFinishMode,
} from '../../../../src/commands/cli/finish.js'

describe('commands/cli/finish', () => {
  describe('resolveFinishMode', () => {
    it('returns merge for "merge"', () => {
      expect(resolveFinishMode('merge')).toBe('merge')
    })

    it('returns pr for "pr"', () => {
      expect(resolveFinishMode('pr')).toBe('pr')
    })

    it('returns keep for "keep"', () => {
      expect(resolveFinishMode('keep')).toBe('keep')
    })

    it('returns discard for "discard"', () => {
      expect(resolveFinishMode('discard')).toBe('discard')
    })

    it('returns null for undefined', () => {
      expect(resolveFinishMode(undefined)).toBeNull()
    })

    it('returns null for an invalid string', () => {
      expect(resolveFinishMode('squash')).toBeNull()
    })

    it('returns null for an empty string', () => {
      expect(resolveFinishMode('')).toBeNull()
    })
  })

  describe('determineBaseBranch', () => {
    it('returns "main" when merge-base succeeds with main', async () => {
      const exec = async (cmd: string) => {
        if (cmd.includes('main')) return { stdout: 'abc123\n', stderr: '' }
        throw new Error('not found')
      }
      const result = await determineBaseBranch(exec)
      expect(result).toBe('main')
    })

    it('returns "master" when main fails but master succeeds', async () => {
      const exec = async (cmd: string) => {
        if (cmd.includes('master')) return { stdout: 'def456\n', stderr: '' }
        throw new Error('not found')
      }
      const result = await determineBaseBranch(exec)
      expect(result).toBe('master')
    })

    it('returns null when both main and master fail', async () => {
      const exec = async (
        _cmd: string,
      ): Promise<{ stdout: string; stderr: string }> => {
        throw new Error('not a git repo')
      }
      const result = await determineBaseBranch(exec)
      expect(result).toBeNull()
    })
  })
})
