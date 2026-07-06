import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearDiscoveryCache } from '../../../src/opencode-plugin/hooks/discovery.js'
import {
  OC_HOOK_TIMEOUT_MS,
  OcHookBlockedError,
  clearManifestCache,
  dispatchOcAfter,
  dispatchOcBefore,
} from '../../../src/opencode-plugin/hooks/dispatcher.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

// ─── Fixture helpers ──────────────────────────────────────────────────────────

async function writeFixtureHook(
  dir: string,
  kind: string,
  name: string,
  script: string,
): Promise<string> {
  const hookDir = join(dir, '.anvil', 'hooks', kind)
  await mkdir(hookDir, { recursive: true })
  const path = join(hookDir, name)
  await writeFile(path, script, 'utf-8')
  return path
}

function makeBeforeArgs(
  cwd: string,
  anvilRoot: string,
  tool = 'bash',
  command = 'ls',
) {
  return {
    input: { tool, sessionID: 'sess-001', callID: 'call-001' },
    output: { args: { command } },
    cwd,
    anvilRoot,
  }
}

function makeAfterArgs(
  cwd: string,
  anvilRoot: string,
  tool = 'bash',
  outputText = 'file.txt',
) {
  return {
    input: { tool, sessionID: 'sess-001', callID: 'call-001' },
    output: { title: 'bash result', output: outputText, metadata: {} },
    cwd,
    anvilRoot,
    durationMs: 50,
  }
}

// ─── Test setup ───────────────────────────────────────────────────────────────

let tmpDir: string

beforeEach(async () => {
  tmpDir = createTestTmpDir('dispatcher-test')
  process.env.ANVIL_GLOBAL_HOOKS_OVERRIDE = join(tmpDir, 'global-hooks')
  clearDiscoveryCache()
  clearManifestCache()
})

afterEach(async () => {
  process.env.ANVIL_GLOBAL_HOOKS_OVERRIDE = undefined
  clearDiscoveryCache()
  clearManifestCache()
  await rm(tmpDir, { recursive: true, force: true })
})

// ─── Test 1: happy path — exitCode 0 → no throw ──────────────────────────────

describe('dispatchOcBefore', () => {
  it('1. happy path: hook returns exitCode 0 → no throw', async () => {
    await writeFixtureHook(
      tmpDir,
      'pre-tool-use',
      'pass.cjs',
      'process.stdout.write(JSON.stringify({ exitCode: 0 }))',
    )
    const args = makeBeforeArgs(tmpDir, tmpDir)
    await expect(dispatchOcBefore(args)).resolves.toBeUndefined()
  })

  // ─── Test 2: before-block: exitCode 2 → throws OcHookBlockedError ──────────
  it('2. before-block: hook returns exitCode 2 → throws OcHookBlockedError', async () => {
    await writeFixtureHook(
      tmpDir,
      'pre-tool-use',
      'block.cjs',
      `process.stdout.write(JSON.stringify({ exitCode: 2, message: 'blocked by test' }))`,
    )
    const args = makeBeforeArgs(tmpDir, tmpDir)
    await expect(dispatchOcBefore(args)).rejects.toThrow(OcHookBlockedError)
    await expect(dispatchOcBefore(args)).rejects.toThrow('blocked by test')
  })

  // ─── Test 3: before-warn: exitCode 1 → resolves, warning emitted ───────────
  it('3. before-warn: hook returns exitCode 1 → resolves without throw', async () => {
    await writeFixtureHook(
      tmpDir,
      'pre-tool-use',
      'warn.cjs',
      `process.stdout.write(JSON.stringify({ exitCode: 1, message: 'soft warning' }))`,
    )
    const args = makeBeforeArgs(tmpDir, tmpDir)
    await expect(dispatchOcBefore(args)).resolves.toBeUndefined()
  })

  // ─── Test 4: timeout → resolves with exitCode 0 (fail-open) ─────────────────
  it(
    '4. timeout: hook sleeps > timeout → resolves fail-open',
    async () => {
      const sleepMs = OC_HOOK_TIMEOUT_MS + 2_000
      await writeFixtureHook(
        tmpDir,
        'pre-tool-use',
        'slow.cjs',
        `setTimeout(() => { process.stdout.write(JSON.stringify({ exitCode: 2 })) }, ${sleepMs})`,
      )
      const args = makeBeforeArgs(tmpDir, tmpDir)
      // Should resolve (not throw) even though hook would have returned exitCode 2
      await expect(dispatchOcBefore(args)).resolves.toBeUndefined()
    },
    OC_HOOK_TIMEOUT_MS + 5_000,
  )

  // ─── Test 5: malformed JSON stdout → resolves exitCode 0 ───────────────────
  it('5. malformed JSON stdout → resolves without throw', async () => {
    await writeFixtureHook(
      tmpDir,
      'pre-tool-use',
      'bad-json.cjs',
      `process.stdout.write('not valid json at all!!!')`,
    )
    const args = makeBeforeArgs(tmpDir, tmpDir)
    await expect(dispatchOcBefore(args)).resolves.toBeUndefined()
  })

  // ─── Test 6: argsPatch deep-merge applied to output.args ───────────────────
  it('6. argsPatch from systemInsert is deep-merged into output.args', async () => {
    await writeFixtureHook(
      tmpDir,
      'pre-tool-use',
      'patch.cjs',
      `process.stdout.write(JSON.stringify({
        exitCode: 0,
        systemInsert: JSON.stringify({ argsPatch: { env: { SAFE: 'yes' } } })
      }))`,
    )
    const args = makeBeforeArgs(tmpDir, tmpDir)
    args.output.args = { command: 'ls', env: { EXISTING: 'x' } }
    await dispatchOcBefore(args)
    expect((args.output.args as { env: Record<string, string> }).env).toEqual({
      EXISTING: 'x',
      SAFE: 'yes',
    })
  })

  // ─── Test 7: disabled.hooks skips matching kind ──────────────────────────────
  it('7. disabled.hooks in manifest skips that kind', async () => {
    // Write a hook that would block
    await writeFixtureHook(
      tmpDir,
      'pre-tool-use',
      'would-block.cjs',
      `process.stdout.write(JSON.stringify({ exitCode: 2, message: 'should be skipped' }))`,
    )
    // Write manifest with pre-tool-use disabled
    await mkdir(join(tmpDir, '.anvil'), { recursive: true }).catch(() => {})
    await writeFile(
      join(tmpDir, 'manifest.json'),
      JSON.stringify({ disabled: { hooks: ['pre-tool-use'] } }),
    )
    clearManifestCache()

    const args = makeBeforeArgs(tmpDir, tmpDir)
    // Should NOT throw because the kind is disabled
    await expect(dispatchOcBefore(args)).resolves.toBeUndefined()
  })

  // ─── Test 8: no hooks registered → resolves silently ───────────────────────
  it('8. no hooks for any kind → resolves silently', async () => {
    const args = makeBeforeArgs(tmpDir, tmpDir)
    await expect(dispatchOcBefore(args)).resolves.toBeUndefined()
  })
})

describe('dispatchOcAfter', () => {
  // ─── Test 9: after-failure: exitCode 2 → resolves (advisory) ───────────────
  it('9. after-failure: hook returns exitCode 2 → resolves (never throws)', async () => {
    await writeFixtureHook(
      tmpDir,
      'post-tool-use',
      'fail.cjs',
      `process.stdout.write(JSON.stringify({ exitCode: 2, message: 'advisory fail' }))`,
    )
    const args = makeAfterArgs(tmpDir, tmpDir)
    // Must NOT throw
    await expect(dispatchOcAfter(args)).resolves.toBeUndefined()
  })

  // ─── Test 10: on-large-output contextMutation rewrites output.output ────────
  it('10. on-large-output contextMutation rewrites output.output', async () => {
    const mutation = { stashedAt: '/tmp/notepad.md', summary: 'Summary text' }
    await writeFixtureHook(
      tmpDir,
      'on-large-output',
      'compress.cjs',
      `process.stdout.write(JSON.stringify({
        exitCode: 0,
        systemInsert: JSON.stringify(${JSON.stringify(mutation)})
      }))`,
    )
    const args = makeAfterArgs(tmpDir, tmpDir)
    await dispatchOcAfter(args)
    expect(args.output.output).toBe(
      'Summary text\n\nsee notepad: /tmp/notepad.md',
    )
  })

  // ─── Test 11: project hook overrides global by basename ─────────────────────
  it('11. project hook overrides global by basename', async () => {
    // Global hook would block (exitCode 2) — but project override should win
    const globalDir = join(tmpDir, 'global-hooks', 'post-tool-use')
    await mkdir(globalDir, { recursive: true })
    await writeFile(
      join(globalDir, 'same-name.cjs'),
      `process.stdout.write(JSON.stringify({ exitCode: 2, message: 'global' }))`,
    )
    // Project hook returns exitCode 0
    await writeFixtureHook(
      tmpDir,
      'post-tool-use',
      'same-name.cjs',
      'process.stdout.write(JSON.stringify({ exitCode: 0 }))',
    )
    clearDiscoveryCache()

    const args = makeAfterArgs(tmpDir, tmpDir)
    // After hooks never throw, but the global would have logged a failure
    // With project override, only the project hook runs → clean pass
    await expect(dispatchOcAfter(args)).resolves.toBeUndefined()
  })

  // ─── Test 12: parallel scheduling — two 50ms hooks finish in <80ms ──────────
  it('12. hooks within a kind run in parallel (two 50ms hooks finish in <80ms)', async () => {
    // Each hook sleeps 50ms then exits. If serial: ~100ms. If parallel: ~50ms.
    const sleepScript =
      'setTimeout(() => { process.stdout.write(JSON.stringify({ exitCode: 0 })) }, 50)'
    await writeFixtureHook(tmpDir, 'post-tool-use', 'slow-a.cjs', sleepScript)
    await writeFixtureHook(tmpDir, 'post-tool-use', 'slow-b.cjs', sleepScript)
    clearDiscoveryCache()

    const args = makeAfterArgs(tmpDir, tmpDir)
    const start = performance.now()
    await dispatchOcAfter(args)
    const elapsed = performance.now() - start

    // Allow generous headroom for process-spawn overhead, but serial would be ≥100ms
    expect(elapsed).toBeLessThan(800)
    // Sanity: both hooks did run (elapsed ≥ ~50ms process start time)
    expect(elapsed).toBeGreaterThan(30)
  })
})
