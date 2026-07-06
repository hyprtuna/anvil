import { execSync } from 'node:child_process'
import { cpSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTestTmpDir } from '../helpers/tmpdir.js'

describe('build-hooks failure modes', () => {
  it('fails non-zero when a handler has a syntax error', () => {
    const stage = createTestTmpDir('hooks')
    for (const p of ['package.json', 'tsconfig.json', 'scripts', 'src']) {
      cpSync(join(process.cwd(), p), join(stage, p), { recursive: true })
    }
    // Also copy bun.lock if present
    try {
      cpSync(join(process.cwd(), 'bun.lock'), join(stage, 'bun.lock'))
    } catch {}
    // Install node_modules (esbuild is needed)
    try {
      execSync('bun install --frozen-lockfile', {
        cwd: stage,
        stdio: 'pipe',
        timeout: 60_000,
      })
    } catch {
      // fallback to symlink if install fails
      cpSync(join(process.cwd(), 'node_modules'), join(stage, 'node_modules'), {
        recursive: true,
      })
    }
    // Corrupt one handler with invalid JavaScript/TypeScript
    const victim = join(stage, 'src/hooks/handlers/session-start.ts')
    writeFileSync(victim, 'this is not typescript !!!! @@@\n')
    try {
      expect(() =>
        execSync('node scripts/build-hooks.mjs', { cwd: stage, stdio: 'pipe' }),
      ).toThrow()
    } finally {
      rmSync(stage, { recursive: true, force: true })
    }
  }, 120_000)
})
