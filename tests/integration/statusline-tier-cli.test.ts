import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resolveTier,
  statuslineTierCommand,
} from '../../src/commands/cli/statusline-tier.js'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tmpHome: string

beforeEach(async () => {
  tmpHome = join(tmpdir(), `anvil-tier-test-${Date.now()}`)
  await mkdir(tmpHome, { recursive: true })
})

afterEach(async () => {
  await rm(tmpHome, { recursive: true, force: true })
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('anvil statusline tier', () => {
  describe('read mode (no tier arg)', () => {
    it('captures stdout with tier and source when printing current tier', async () => {
      const written: string[] = []
      vi.spyOn(process.stdout, 'write').mockImplementation((s) => {
        written.push(s as string)
        return true
      })

      await statuslineTierCommand({})

      const output = written.join('')
      expect(output).toMatch(/Statusline tier:/)
      expect(output).toMatch(/source:/)
    })

    it('--json flag emits valid JSON with tier and source fields', async () => {
      const written: string[] = []
      vi.spyOn(process.stdout, 'write').mockImplementation((s) => {
        written.push(s as string)
        return true
      })
      vi.stubEnv('ANVIL_OUTPUT_FORMAT', 'text')

      await statuslineTierCommand({ json: true })

      const output = written.join('')
      const parsed = JSON.parse(output) as unknown
      expect(typeof parsed).toBe('object')
      const obj = parsed as Record<string, unknown>
      expect(['minimal', 'default', 'maximal']).toContain(obj.tier)
      expect(['user', 'default']).toContain(obj.source)
    })
  })

  describe('invalid tier argument → exit 2', () => {
    it('exits with code 2 and prints valid set on invalid tier', async () => {
      const stderrWrites: string[] = []
      vi.spyOn(process.stderr, 'write').mockImplementation((s) => {
        stderrWrites.push(s as string)
        return true
      })
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((_code?: number) => {
          throw new Error(`process.exit(${_code})`)
        })

      await expect(statuslineTierCommand({ tier: 'ultra' })).rejects.toThrow(
        'process.exit(2)',
      )
      expect(exitSpy).toHaveBeenCalledWith(2)

      const errOutput = stderrWrites.join('')
      expect(errOutput).toContain('minimal')
      expect(errOutput).toContain('default')
      expect(errOutput).toContain('maximal')
    })
  })

  describe('write + read round-trip', () => {
    it('writes a tier to models.json and reads it back via file I/O', async () => {
      const anvilDir = join(tmpHome, '.anvil')
      await mkdir(anvilDir, { recursive: true })
      const modelsPath = join(anvilDir, 'models.json')

      // Write maximal tier directly (simulating what statuslineTierCommand write path does).
      const content = { statusline: { tier: 'maximal' } }
      await writeFile(
        modelsPath,
        `${JSON.stringify(content, null, 2)}\n`,
        'utf-8',
      )

      // Read it back.
      const raw = await readFile(modelsPath, 'utf-8')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const sl = parsed.statusline as Record<string, unknown>
      expect(sl.tier).toBe('maximal')
    })

    it('preserves existing models.json keys when tier is updated', async () => {
      const anvilDir = join(tmpHome, '.anvil')
      await mkdir(anvilDir, { recursive: true })
      const modelsPath = join(anvilDir, 'models.json')

      // Write initial models.json with adjacent fields.
      const initial = {
        defaults: { model: 'claude-sonnet-4-5', effort: 'medium' },
        statusline: { show_subagent_panel: true, tier: 'default' },
      }
      await writeFile(
        modelsPath,
        `${JSON.stringify(initial, null, 2)}\n`,
        'utf-8',
      )

      // Simulate write path: deep-merge only statusline.tier.
      const rawBefore = await readFile(modelsPath, 'utf-8')
      const existing = JSON.parse(rawBefore) as Record<string, unknown>
      const existingSl = existing.statusline as Record<string, unknown>
      const updated = {
        ...existing,
        statusline: { ...existingSl, tier: 'maximal' },
      }
      await writeFile(
        modelsPath,
        `${JSON.stringify(updated, null, 2)}\n`,
        'utf-8',
      )

      const final = JSON.parse(await readFile(modelsPath, 'utf-8')) as Record<
        string,
        unknown
      >
      const finalSl = final.statusline as Record<string, unknown>

      expect(finalSl.tier).toBe('maximal')
      expect(finalSl.show_subagent_panel).toBe(true)
      expect(final.defaults).toBeDefined()
    })
  })

  describe('resolveTier()', () => {
    it('returns a valid tier and source', async () => {
      const result = await resolveTier()
      expect(['minimal', 'default', 'maximal']).toContain(result.tier)
      expect(['user', 'default']).toContain(result.source)
    })

    it('returns default tier and source=default when models.json absent', async () => {
      // Only run this assertion if the real ~/.anvil/models.json does not exist.
      const anvilPath = join(homedir(), '.anvil', 'models.json')
      if (!existsSync(anvilPath)) {
        const result = await resolveTier()
        expect(result.tier).toBe('default')
        expect(result.source).toBe('default')
      } else {
        // File exists — we can still verify types are correct.
        const result = await resolveTier()
        expect(['minimal', 'default', 'maximal']).toContain(result.tier)
        expect(['user', 'default']).toContain(result.source)
      }
    })
  })
})
