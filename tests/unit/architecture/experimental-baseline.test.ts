/**
 * ANV-0245 / ANV-0247 / ANV-0248 — Experimental tree baseline architecture test.
 *
 * Asserts:
 *   1. src/experimental/ exists on disk.
 *   2. src/experimental/ contains the expected entries (meta files + extensions/ from ANV-0248 + notepads/ from ANV-0247).
 *   3. The registry is in src/core/, not src/experimental/.
 *   4. The registry returns exactly 3 seeded entries.
 *   5. tsconfig.json excludes src/experimental.
 *   6. tsconfig.experimental.json exists and overrides outDir.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listExperimentalFeatures } from '../../../src/core/experimental-registry.js'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')

describe('experimental-baseline', () => {
  describe('src/experimental/ directory', () => {
    it('exists', () => {
      expect(existsSync(join(REPO_ROOT, 'src', 'experimental'))).toBe(true)
    })

    it('contains AGENTS.md, CLAUDE.md, README.md, register-cli.ts, catalog/, extensions/, and notepads/', () => {
      const dir = join(REPO_ROOT, 'src', 'experimental')
      const entries = readdirSync(dir, { withFileTypes: true })
      const names = entries.map((e) => e.name).sort()
      // ANV-0246: catalog/ feature directory added.
      // ANV-0248: extensions/ feature directory added alongside the 4 meta/skeleton files.
      // ANV-0247: notepads/ feature directory added.
      expect(names).toEqual([
        'AGENTS.md',
        'CLAUDE.md',
        'README.md',
        'catalog',
        'extensions',
        'notepads',
        'register-cli.ts',
      ])
    })

    it('extensions/ subdirectory contains cli/ and register-extension-cli.ts', () => {
      const extDir = join(REPO_ROOT, 'src', 'experimental', 'extensions')
      const entries = readdirSync(extDir, { withFileTypes: true })
      const names = entries.map((e) => e.name).sort()
      // cli/ holds the extension command handlers (moved from src/commands/cli/extension/)
      // register-extension-cli.ts is the CLI registration glue (ANV-0248)
      expect(names).toContain('cli')
      expect(names).toContain('register-extension-cli.ts')
    })
  })

  describe('registry location', () => {
    it('src/core/experimental-registry.ts exists', () => {
      expect(
        existsSync(join(REPO_ROOT, 'src', 'core', 'experimental-registry.ts')),
      ).toBe(true)
    })

    it('registry is NOT inside src/experimental/', () => {
      expect(
        existsSync(
          join(REPO_ROOT, 'src', 'experimental', 'experimental-registry.ts'),
        ),
      ).toBe(false)
    })
  })

  describe('registry seed data', () => {
    it('returns exactly 3 seeded entries', () => {
      expect(listExperimentalFeatures()).toHaveLength(3)
    })

    it('seed ids are catalog, notepads, extensions', () => {
      const ids = listExperimentalFeatures().map((f) => f.id)
      expect(ids.sort()).toEqual(['catalog', 'extensions', 'notepads'])
    })
  })

  describe('tsconfig.json', () => {
    it('excludes src/experimental', () => {
      const raw = readFileSync(join(REPO_ROOT, 'tsconfig.json'), 'utf-8')
      const parsed = JSON.parse(raw) as { exclude?: string[] }
      expect(parsed.exclude).toBeDefined()
      expect(parsed.exclude).toContain('src/experimental')
    })
  })

  describe('tsconfig.experimental.json', () => {
    it('exists', () => {
      expect(existsSync(join(REPO_ROOT, 'tsconfig.experimental.json'))).toBe(
        true,
      )
    })

    it('overrides outDir to dist-experimental', () => {
      const raw = readFileSync(
        join(REPO_ROOT, 'tsconfig.experimental.json'),
        'utf-8',
      )
      const parsed = JSON.parse(raw) as {
        compilerOptions?: { outDir?: string }
      }
      expect(parsed.compilerOptions?.outDir).toBe('./dist-experimental')
    })

    it('extends tsconfig.json', () => {
      const raw = readFileSync(
        join(REPO_ROOT, 'tsconfig.experimental.json'),
        'utf-8',
      )
      const parsed = JSON.parse(raw) as { extends?: string }
      expect(parsed.extends).toBe('./tsconfig.json')
    })
  })
})
