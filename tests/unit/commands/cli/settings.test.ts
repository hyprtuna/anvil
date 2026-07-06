import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  settingsShowCommand,
  settingsValidateCommand,
} from '../../../../src/commands/cli/settings.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

function makeTmpDir(): string {
  return createTestTmpDir('settings-cli')
}

interface CapturedExit {
  code: number | null
}

function captureProcess(): {
  stdout: () => string
  stderr: () => string
  exit: CapturedExit
  restore: () => void
} {
  const out: string[] = []
  const err: string[] = []
  const captured: CapturedExit = { code: null }

  const origStdout = process.stdout.write.bind(process.stdout)
  const origStderr = process.stderr.write.bind(process.stderr)
  const origExit = process.exit
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString())
    return true
  }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString())
    return true
  }) as typeof process.stderr.write
  const fakeExit: (code?: number) => never = (code) => {
    captured.code = code ?? 0
    throw new Error(`__test_exit_${code ?? 0}__`)
  }
  process.exit = fakeExit as typeof process.exit

  return {
    stdout: () => out.join(''),
    stderr: () => err.join(''),
    exit: captured,
    restore: () => {
      process.stdout.write = origStdout
      process.stderr.write = origStderr
      process.exit = origExit
    },
  }
}

describe('settings show / validate (Plan 28 G2/G3)', () => {
  let tmpProject: string
  let tmpHome: string

  beforeEach(() => {
    tmpProject = makeTmpDir()
    tmpHome = makeTmpDir()
    mkdirSync(join(tmpProject, '.claude'), { recursive: true })
    mkdirSync(join(tmpHome, '.claude'), { recursive: true })
    // No env mutation — we pass cwd/home via opts.
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(tmpProject, { recursive: true, force: true })
    rmSync(tmpHome, { recursive: true, force: true })
  })

  describe('settingsShowCommand', () => {
    it('merges project + user settings with project winning', async () => {
      writeFileSync(
        join(tmpHome, '.claude', 'settings.json'),
        JSON.stringify({ effortLevel: 'low', model: 'claude-haiku-4-5' }),
      )
      writeFileSync(
        join(tmpProject, '.claude', 'settings.json'),
        JSON.stringify({ effortLevel: 'medium' }),
      )

      const cap = captureProcess()
      try {
        await settingsShowCommand({
          json: true,
          cwd: tmpProject,
          home: tmpHome,
        })
      } finally {
        cap.restore()
      }
      const payload = JSON.parse(cap.stdout()) as {
        merged: Record<string, unknown>
      }
      // project wins for the conflicting key
      expect(payload.merged.effortLevel).toBe('medium')
      // user-only key is preserved
      expect(payload.merged.model).toBe('claude-haiku-4-5')
    })

    it('falls back to user when project is missing', async () => {
      writeFileSync(
        join(tmpHome, '.claude', 'settings.json'),
        JSON.stringify({ effortLevel: 'high' }),
      )

      const cap = captureProcess()
      try {
        await settingsShowCommand({
          json: true,
          cwd: tmpProject,
          home: tmpHome,
        })
      } finally {
        cap.restore()
      }
      const payload = JSON.parse(cap.stdout()) as {
        source: { project: string | null; user: string | null }
        merged: Record<string, unknown>
      }
      expect(payload.source.project).toBeNull()
      expect(payload.merged.effortLevel).toBe('high')
    })

    it('emits {} when neither file exists', async () => {
      const cap = captureProcess()
      try {
        await settingsShowCommand({
          json: true,
          cwd: tmpProject,
          home: tmpHome,
        })
      } finally {
        cap.restore()
      }
      const payload = JSON.parse(cap.stdout()) as {
        merged: Record<string, unknown>
      }
      expect(payload.merged).toEqual({})
    })
  })

  describe('settingsValidateCommand', () => {
    it('exits 0 with ok=true on a valid template', async () => {
      writeFileSync(
        join(tmpProject, '.claude', 'settings.json'),
        JSON.stringify({
          permissions: { defaultMode: 'default' },
          effortLevel: 'medium',
          disableAllHooks: false,
        }),
      )
      const cap = captureProcess()
      let exited = false
      try {
        await settingsValidateCommand({
          json: true,
          cwd: tmpProject,
          home: tmpHome,
        })
      } catch (err) {
        if ((err as Error).message.startsWith('__test_exit_')) exited = true
        else throw err
      } finally {
        cap.restore()
      }
      expect(exited).toBe(false)
      const payload = JSON.parse(cap.stdout()) as { ok: boolean }
      expect(payload.ok).toBe(true)
    })

    it('exits 1 with issues when effortLevel is invalid', async () => {
      writeFileSync(
        join(tmpProject, '.claude', 'settings.json'),
        JSON.stringify({ effortLevel: 'turbo' }),
      )
      const cap = captureProcess()
      let exited = false
      try {
        await settingsValidateCommand({
          json: true,
          cwd: tmpProject,
          home: tmpHome,
        })
      } catch (err) {
        if ((err as Error).message.startsWith('__test_exit_')) exited = true
        else throw err
      } finally {
        cap.restore()
      }
      expect(exited).toBe(true)
      expect(cap.exit.code).toBe(1)
      const payload = JSON.parse(cap.stdout()) as {
        ok: boolean
        issues: { path: string; message: string }[]
      }
      expect(payload.ok).toBe(false)
      expect(payload.issues.length).toBeGreaterThan(0)
      expect(payload.issues[0].path).toContain('effortLevel')
    })

    it('exits 1 when file is missing', async () => {
      const cap = captureProcess()
      let exited = false
      try {
        await settingsValidateCommand({
          json: true,
          cwd: tmpProject,
          home: tmpHome,
        })
      } catch (err) {
        if ((err as Error).message.startsWith('__test_exit_')) exited = true
        else throw err
      } finally {
        cap.restore()
      }
      expect(exited).toBe(true)
      expect(cap.exit.code).toBe(1)
    })

    it('exits 1 with parse error message when JSON is malformed', async () => {
      writeFileSync(
        join(tmpProject, '.claude', 'settings.json'),
        '{ this is not json',
      )
      const cap = captureProcess()
      let exited = false
      try {
        await settingsValidateCommand({
          json: true,
          cwd: tmpProject,
          home: tmpHome,
        })
      } catch (err) {
        if ((err as Error).message.startsWith('__test_exit_')) exited = true
        else throw err
      } finally {
        cap.restore()
      }
      expect(exited).toBe(true)
      expect(cap.exit.code).toBe(1)
      const payload = JSON.parse(cap.stdout()) as {
        ok: boolean
        issues: { message: string }[]
      }
      expect(payload.ok).toBe(false)
      expect(payload.issues[0].message.toLowerCase()).toContain('json')
    })

    it('--user flag points at the home file instead of cwd', async () => {
      writeFileSync(
        join(tmpHome, '.claude', 'settings.json'),
        JSON.stringify({ effortLevel: 'high' }),
      )
      const cap = captureProcess()
      try {
        await settingsValidateCommand({
          json: true,
          user: true,
          cwd: tmpProject,
          home: tmpHome,
        })
      } finally {
        cap.restore()
      }
      const payload = JSON.parse(cap.stdout()) as {
        ok: boolean
        path: string
      }
      expect(payload.ok).toBe(true)
      expect(payload.path).toBe(join(tmpHome, '.claude', 'settings.json'))
    })
  })
})
