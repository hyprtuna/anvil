/**
 * Phase 1 (v0.11.2 Bundle A) — unit tests for readPluginIndex hard-fail.
 *
 * Strategy: we cannot directly import readPluginIndex (module-private).
 * Instead we test via generateOpenCode and use vi.mock to swap PLUGIN_DIST
 * by monkey-patching the module's resolved constant through the import chain.
 * The simpler approach: test the observable contract — generateOpenCode rejects
 * with a build-hint message when the dist file is absent.
 *
 * For the happy path, the dist file is expected to already exist after
 * `npm run build`. The test is gated: if the built artifact is absent the
 * happy-path test is skipped so a fresh checkout without build doesn't fail.
 */
import { existsSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AdapterContext } from '../../../../src/adapters/interface.js'
import { generateOpenCode } from '../../../../src/adapters/opencode/generate.js'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

const __dirname_test = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname_test, '../../../../')
const REAL_PLUGIN_DIST = join(REPO_ROOT, 'dist', 'opencode-plugin', 'index.js')

let tmp: string

beforeAll(() => {
  tmp = createTestTmpDir('oc-rpi')
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

function makeContext(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    cwd: tmp,
    scope: 'project',
    config: buildDefaultConfig(),
    skills: [],
    hooks: [],
    agents: [],
    ...overrides,
  }
}

describe('readPluginIndex (via generateOpenCode)', () => {
  it.skipIf(!existsSync(REAL_PLUGIN_DIST))(
    'happy path: returns JS content when dist artifact exists',
    async () => {
      // generateOpenCode reads the dist file; we just assert it resolves and
      // the emitted index.js file has no TypeScript syntax.
      const result = await generateOpenCode(makeContext())
      const pluginFile = result.files.find(
        (f) => f.relativePath === 'plugins/opencode/index.js',
      )
      expect(pluginFile).toBeDefined()
      // Non-empty
      expect(pluginFile!.content.length).toBeGreaterThan(0)
      // Not raw TypeScript — no 'import type' or ': string' type annotations
      expect(pluginFile!.content).not.toMatch(/\bimport type\b/)
    },
  )

  it('sad path: rejects with npm run build hint when dist is absent', async () => {
    // Temporarily rename the dist file to simulate missing artifact.
    // If it doesn't exist yet (fresh checkout), this test is still valid.
    const backup = `${REAL_PLUGIN_DIST}.bak`
    let hadFile = false
    if (existsSync(REAL_PLUGIN_DIST)) {
      const { renameSync } = await import('node:fs')
      renameSync(REAL_PLUGIN_DIST, backup)
      hadFile = true
    }

    try {
      await expect(generateOpenCode(makeContext())).rejects.toThrow(
        /npm run build/,
      )
    } finally {
      if (hadFile) {
        const { renameSync } = await import('node:fs')
        renameSync(backup, REAL_PLUGIN_DIST)
      }
    }
  })
})
