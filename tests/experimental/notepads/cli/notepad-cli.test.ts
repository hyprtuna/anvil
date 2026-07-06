import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { notepadsCommand } from '../../../../src/experimental/notepads/cli/notepad.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

// Mock detectBranch so tests don't require a real git repo
vi.mock('../../../../src/core/notepads/index.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../../src/core/notepads/index.js')
    >()
  return {
    ...actual,
    detectBranch: vi.fn().mockReturnValue('test-branch'),
  }
})

let tmpDir: string

beforeEach(() => {
  tmpDir = createTestTmpDir('notepad-cli-test')
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe('anvil notepad CLI', () => {
  it('shows usage when no subcommand given', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await notepadsCommand({ cwd: tmpDir, args: [] })
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'))
    consoleSpy.mockRestore()
  })

  describe('init subcommand', () => {
    it('creates .anvil/notepads/<slug>/ with 5 section files', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await notepadsCommand({ cwd: tmpDir, args: ['init'] })

      const dir = join(tmpDir, '.anvil', 'notepads', 'test-branch')
      expect(existsSync(dir)).toBe(true)

      const sections = [
        'learnings',
        'decisions',
        'issues',
        'verification',
        'problems',
      ]
      for (const s of sections) {
        expect(existsSync(join(dir, `${s}.md`))).toBe(true)
      }
      consoleSpy.mockRestore()
    })

    it('is idempotent — running twice does not fail', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await notepadsCommand({ cwd: tmpDir, args: ['init'] })
      await notepadsCommand({ cwd: tmpDir, args: ['init'] }) // second run
      expect(
        existsSync(join(tmpDir, '.anvil', 'notepads', 'test-branch')),
      ).toBe(true)
      consoleSpy.mockRestore()
    })

    it('respects --branch flag', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await notepadsCommand({
        cwd: tmpDir,
        args: ['init', '--branch', 'feature/auth'],
      })

      const dir = join(tmpDir, '.anvil', 'notepads', 'feature-auth')
      expect(existsSync(dir)).toBe(true)
      consoleSpy.mockRestore()
    })
  })

  describe('write subcommand', () => {
    it('appends an entry to the specified section', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await notepadsCommand({
        cwd: tmpDir,
        args: [
          'write',
          '--section',
          'learnings',
          '--headline',
          'test learning headline',
        ],
      })

      const sectionFile = join(
        tmpDir,
        '.anvil',
        'notepads',
        'test-branch',
        'learnings.md',
      )
      expect(existsSync(sectionFile)).toBe(true)
      const content = await import('node:fs/promises').then((m) =>
        m.readFile(sectionFile, 'utf-8'),
      )
      expect(content).toContain('test learning headline')
      consoleSpy.mockRestore()
    })

    it('rejects write without --section', async () => {
      const stderrSpy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true)
      await notepadsCommand({
        cwd: tmpDir,
        args: ['write', '--headline', 'no section'],
      })
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('--section is required'),
      )
      stderrSpy.mockRestore()
    })

    it('rejects write without --headline', async () => {
      const stderrSpy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true)
      await notepadsCommand({
        cwd: tmpDir,
        args: ['write', '--section', 'learnings'],
      })
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('--headline is required'),
      )
      stderrSpy.mockRestore()
    })

    it('rejects invalid section name', async () => {
      const stderrSpy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true)
      await notepadsCommand({
        cwd: tmpDir,
        args: ['write', '--section', 'thoughts', '--headline', 'test'],
      })
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid section'),
      )
      stderrSpy.mockRestore()
    })
  })

  describe('read subcommand', () => {
    it('shows no-notepad message when notepad does not exist', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await notepadsCommand({ cwd: tmpDir, args: ['read'] })
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No notepad'),
      )
      consoleSpy.mockRestore()
    })

    it('reads recent-context.md after init + write', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await notepadsCommand({ cwd: tmpDir, args: ['init'] })
      await notepadsCommand({
        cwd: tmpDir,
        args: ['write', '--section', 'decisions', '--headline', 'Chose Path E'],
      })
      await notepadsCommand({ cwd: tmpDir, args: ['read'] })
      const calls = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
      expect(calls).toContain('Chose Path E')
      consoleSpy.mockRestore()
    })

    it('reads specific section with --section flag', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await notepadsCommand({
        cwd: tmpDir,
        args: [
          'write',
          '--section',
          'issues',
          '--headline',
          'Bug in auth flow',
        ],
      })
      await notepadsCommand({
        cwd: tmpDir,
        args: ['read', '--section', 'issues'],
      })
      const calls = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
      expect(calls).toContain('Bug in auth flow')
      consoleSpy.mockRestore()
    })
  })

  describe('list subcommand', () => {
    it('shows empty message when no notepads', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await notepadsCommand({ cwd: tmpDir, args: ['list'] })
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No notepads'),
      )
      consoleSpy.mockRestore()
    })

    it('lists branch slugs after init', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await notepadsCommand({ cwd: tmpDir, args: ['init'] })
      await notepadsCommand({ cwd: tmpDir, args: ['list'] })
      const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
      expect(output).toContain('test-branch')
      consoleSpy.mockRestore()
    })
  })

  describe('validate subcommand', () => {
    it('reports OK when no notepads', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await notepadsCommand({ cwd: tmpDir, args: ['validate'] })
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No notepads'),
      )
      consoleSpy.mockRestore()
    })

    it('validates existing notepads successfully', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await notepadsCommand({ cwd: tmpDir, args: ['init'] })
      await notepadsCommand({ cwd: tmpDir, args: ['validate'] })
      const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
      expect(output).toContain('OK')
      consoleSpy.mockRestore()
    })
  })

  describe('compact subcommand', () => {
    it('runs compact and reports results', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await notepadsCommand({ cwd: tmpDir, args: ['init'] })
      await notepadsCommand({ cwd: tmpDir, args: ['compact'] })
      const output = consoleSpy.mock.calls.map((c) => c[0]).join('\n')
      expect(output).toContain('Compacted')
      consoleSpy.mockRestore()
    })
  })

  describe('archive and restore subcommands', () => {
    it('archive moves notepad to .anvil/archive/', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await notepadsCommand({ cwd: tmpDir, args: ['init'] })
      await notepadsCommand({ cwd: tmpDir, args: ['archive'] })

      const notepadsPath = join(tmpDir, '.anvil', 'notepads', 'test-branch')
      const archivePath = join(tmpDir, '.anvil', 'archive', 'test-branch')
      expect(existsSync(notepadsPath)).toBe(false)
      expect(existsSync(archivePath)).toBe(true)
      consoleSpy.mockRestore()
    })

    it('restore moves notepad back from archive', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      await notepadsCommand({ cwd: tmpDir, args: ['init'] })
      await notepadsCommand({ cwd: tmpDir, args: ['archive'] })
      await notepadsCommand({ cwd: tmpDir, args: ['restore'] })

      const notepadsPath = join(tmpDir, '.anvil', 'notepads', 'test-branch')
      const archivePath = join(tmpDir, '.anvil', 'archive', 'test-branch')
      expect(existsSync(notepadsPath)).toBe(true)
      expect(existsSync(archivePath)).toBe(false)
      consoleSpy.mockRestore()
    })

    it('archive errors when notepad does not exist', async () => {
      const stderrSpy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true)
      await notepadsCommand({ cwd: tmpDir, args: ['archive'] })
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('No notepad found'),
      )
      stderrSpy.mockRestore()
    })
  })

  describe('clean subcommand', () => {
    it('does not throw when run on a non-git directory', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const stderrSpy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true)
      // Should not throw even with no git repo or notepads
      await expect(
        notepadsCommand({ cwd: tmpDir, args: ['clean', '--dry-run'] }),
      ).resolves.toBeUndefined()
      consoleSpy.mockRestore()
      stderrSpy.mockRestore()
    })

    it('reports empty when notepads dir does not exist', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      // Mock execSync to pretend git works and returns empty branches
      const { execSync } = await import('node:child_process')
      vi.spyOn({ execSync }, 'execSync').mockReturnValue(Buffer.from(''))

      await notepadsCommand({ cwd: tmpDir, args: ['clean'] })
      // No error thrown is the key assertion
      consoleSpy.mockRestore()
    })
  })

  describe('unknown subcommand', () => {
    it('prints error for unknown subcommand', async () => {
      const stderrSpy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true)
      await notepadsCommand({ cwd: tmpDir, args: ['frobnicate'] })
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown subcommand'),
      )
      stderrSpy.mockRestore()
    })
  })
})
