/**
 * Plan 33 G4 — Install-source resilience integration test.
 *
 * Verifies that:
 * 1. syncAnvilHome mirrors dist/ and dist-hooks/ into ~/.anvil/runtime/
 * 2. The written ~/.anvil/bin/anvil.cjs shim does NOT embed the install-time
 *    source path and uses homedir()-based runtime resolution instead.
 * 3. The written ~/.anvil/bin/install.cjs shim follows the same pattern.
 * 4. After the runtime mirror is in place, running the shim with node does not
 *    produce ERR_MODULE_NOT_FOUND errors referencing the source path.
 *
 * Uses a sandbox HOME so it never touches the development's actual ~/.anvil/.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createTestTmpDir } from '../helpers/tmpdir.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..', '..')

// Only run if dist/ is present (requires a prior build step).
const distExists = existsSync(join(REPO_ROOT, 'dist', 'index.js'))
const distHooksExists = existsSync(join(REPO_ROOT, 'dist-hooks'))

function makeTmp(purpose: string): string {
  const tmp = createTestTmpDir(purpose)
  return tmp
}

describe.skipIf(!distExists)(
  'install-source-resilience — runtime mirror',
  () => {
    it('runtime mirror is created at ~/.anvil/runtime/ after syncAnvilHome', async () => {
      const sandboxHome = makeTmp('test-home')
      const anvilHome = join(sandboxHome, '.anvil')

      const { syncAnvilHome } = await import('../../src/installer/sync.js')
      const { buildContextFromRepo } = await import(
        '../../src/installer/context-from-repo.js'
      )

      const ctx = await buildContextFromRepo({ home: sandboxHome })
      await syncAnvilHome({ ctx, target: anvilHome })

      // Runtime mirror must contain dist/index.js
      expect(existsSync(join(anvilHome, 'runtime', 'dist', 'index.js'))).toBe(
        true,
      )

      // Runtime mirror must contain package.json
      expect(existsSync(join(anvilHome, 'runtime', 'package.json'))).toBe(true)

      // dist-hooks mirror (if source had dist-hooks)
      if (distHooksExists) {
        expect(existsSync(join(anvilHome, 'runtime', 'dist-hooks'))).toBe(true)
      }
    }, 30_000)

    it('second syncAnvilHome is idempotent — runtime mirror overwrites cleanly', async () => {
      const sandboxHome = makeTmp('test-home-idem')
      const anvilHome = join(sandboxHome, '.anvil')

      const { syncAnvilHome } = await import('../../src/installer/sync.js')
      const { buildContextFromRepo } = await import(
        '../../src/installer/context-from-repo.js'
      )

      const ctx = await buildContextFromRepo({ home: sandboxHome })
      await syncAnvilHome({ ctx, target: anvilHome })
      // Second run should not throw
      await syncAnvilHome({ ctx, target: anvilHome })

      expect(existsSync(join(anvilHome, 'runtime', 'dist', 'index.js'))).toBe(
        true,
      )
    }, 45_000)
  },
)

describe.skipIf(!distExists)('install-source-resilience — shim content', () => {
  it('anvil.cjs shim uses runtime mirror path, not hardcoded source path', async () => {
    const sandboxHome = makeTmp('test-home-shim')
    const anvilHome = join(sandboxHome, '.anvil')

    const { syncAnvilHome } = await import('../../src/installer/sync.js')
    const { buildContextFromRepo } = await import(
      '../../src/installer/context-from-repo.js'
    )

    const ctx = await buildContextFromRepo({ home: sandboxHome })
    await syncAnvilHome({ ctx, target: anvilHome })

    const anvilCjs = readFileSync(join(anvilHome, 'bin', 'anvil.cjs'), 'utf-8')

    // Must NOT embed the install-time REPO_ROOT
    expect(anvilCjs).not.toContain(REPO_ROOT)

    // Must NOT have the brittle bun src fast-path
    expect(anvilCjs).not.toContain('hasBun')
    expect(anvilCjs).not.toContain('src/index.ts')

    // Must reference runtime mirror via homedir()
    expect(anvilCjs).toContain('homedir()')
    expect(anvilCjs).toContain('runtime')
    expect(anvilCjs).toContain('dist/anvil-bundle.cjs')
  }, 20_000)

  it('install.cjs shim uses runtime mirror path, not hardcoded source path', async () => {
    const sandboxHome = makeTmp('test-home-inst')
    const anvilHome = join(sandboxHome, '.anvil')

    const { syncAnvilHome } = await import('../../src/installer/sync.js')
    const { buildContextFromRepo } = await import(
      '../../src/installer/context-from-repo.js'
    )

    const ctx = await buildContextFromRepo({ home: sandboxHome })
    await syncAnvilHome({ ctx, target: anvilHome })

    const installCjs = readFileSync(
      join(anvilHome, 'bin', 'install.cjs'),
      'utf-8',
    )

    // Must NOT embed the install-time REPO_ROOT
    expect(installCjs).not.toContain(REPO_ROOT)

    // Must reference runtime mirror
    expect(installCjs).toContain('runtime')
    expect(installCjs).toContain('dist/installer-bundle.cjs')
  }, 20_000)

  it('anvil.cjs shim exits gracefully (no ERR_MODULE_NOT_FOUND) when runtime is present', async () => {
    const sandboxHome = makeTmp('test-home-exec')
    const anvilHome = join(sandboxHome, '.anvil')

    const { syncAnvilHome } = await import('../../src/installer/sync.js')
    const { buildContextFromRepo } = await import(
      '../../src/installer/context-from-repo.js'
    )

    const ctx = await buildContextFromRepo({ home: sandboxHome })
    await syncAnvilHome({ ctx, target: anvilHome })

    const anvilCjs = join(anvilHome, 'bin', 'anvil.cjs')

    // Run the shim with --version
    const result = spawnSync(process.execPath, [anvilCjs, '--version'], {
      env: { ...process.env, HOME: sandboxHome },
      timeout: 15_000,
      encoding: 'utf-8',
    })

    const combined = (result.stdout ?? '') + (result.stderr ?? '')

    // The critical failure mode is ERR_MODULE_NOT_FOUND for the SOURCE path
    // We ensure no such error occurs
    expect(combined).not.toMatch(/ERR_MODULE_NOT_FOUND/)

    // Either exit 0 (anvil --version) or non-zero due to app-level issues,
    // but never because of missing source-path modules
    // The shim must at minimum print the version or a meaningful error
    expect(result.signal).toBeNull()
  }, 20_000)
})
