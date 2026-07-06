/**
 * Integration smoke test for OpenCode plugin hook dispatch (B5.1).
 *
 * Verifies the exit criterion:
 *   A pre-tool-use hook that returns exitCode 2 causes tool.execute.before
 *   to throw OcHookBlockedError, aborting the tool call.
 *   A benign payload passes through without error.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearDiscoveryCache } from '../../src/opencode-plugin/hooks/discovery.js'
import {
  OcHookBlockedError,
  clearManifestCache,
} from '../../src/opencode-plugin/hooks/dispatcher.js'
import AnvilPlugin from '../../src/opencode-plugin/index.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

describe('opencode-plugin-hooks-smoke', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = createTestTmpDir('oc-smoke')
    process.env.ANVIL_GLOBAL_HOOKS_OVERRIDE = join(tmpDir, 'global-hooks')
    process.env.ANVIL_ROOT_OVERRIDE = tmpDir
    // ANV-0013: stage the bootstrap skill the OC plugin requires.
    await mkdir(join(tmpDir, 'skills', 'using-anvil'), { recursive: true })
    await writeFile(
      join(tmpDir, 'skills', 'using-anvil', 'SKILL.md'),
      '# using-anvil\n',
    )
    clearDiscoveryCache()
    clearManifestCache()
  })

  afterEach(async () => {
    process.env.ANVIL_GLOBAL_HOOKS_OVERRIDE = undefined
    process.env.ANVIL_ROOT_OVERRIDE = undefined
    clearDiscoveryCache()
    clearManifestCache()
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('pre-tool-use hook blocking a malicious bash command throws OcHookBlockedError', async () => {
    // Write a no-rm-rf style hook that exits 2 if args.command contains 'rm -rf /'
    const hookDir = join(tmpDir, '.anvil', 'hooks', 'pre-tool-use')
    await mkdir(hookDir, { recursive: true })
    await writeFile(
      join(hookDir, 'no-rm-rf.cjs'),
      `
const data = [];
process.stdin.on('data', c => data.push(c));
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(Buffer.concat(data).toString());
    const cmd = payload?.payload?.args?.command ?? '';
    if (typeof cmd === 'string' && cmd.includes('rm -rf /')) {
      process.stdout.write(JSON.stringify({ exitCode: 2, message: 'rm -rf / is not allowed' }));
    } else {
      process.stdout.write(JSON.stringify({ exitCode: 0 }));
    }
  } catch {
    process.stdout.write(JSON.stringify({ exitCode: 0 }));
  }
  process.exit(0);
});
`,
    )

    const plugin = await AnvilPlugin()
    const toolBefore = plugin['tool.execute.before']
    expect(toolBefore).toBeDefined()

    if (!toolBefore) throw new Error('tool.execute.before not registered')

    // Malicious payload — should throw OcHookBlockedError
    await expect(
      toolBefore(
        { tool: 'bash', sessionID: 'sess-smoke', callID: 'call-1' },
        { args: { command: 'rm -rf /' } },
      ),
    ).rejects.toThrow(OcHookBlockedError)

    // Benign payload — should resolve cleanly
    await expect(
      toolBefore(
        { tool: 'bash', sessionID: 'sess-smoke', callID: 'call-2' },
        { args: { command: 'ls -la' } },
      ),
    ).resolves.toBeUndefined()
  })

  it('tool.execute.after handler never throws even when hook fails', async () => {
    const hookDir = join(tmpDir, '.anvil', 'hooks', 'post-tool-use')
    await mkdir(hookDir, { recursive: true })
    await writeFile(
      join(hookDir, 'always-fail.cjs'),
      // exitCode 2 from after hook — must NOT throw
      `process.stdout.write(JSON.stringify({ exitCode: 2, message: 'advisory fail' })); process.exit(0);`,
    )

    const plugin = await AnvilPlugin()
    const toolAfter = plugin['tool.execute.after']
    expect(toolAfter).toBeDefined()

    if (!toolAfter) throw new Error('tool.execute.after not registered')

    await expect(
      toolAfter(
        { tool: 'bash', sessionID: 'sess-smoke', callID: 'call-3' },
        { title: 'result', output: 'some output', metadata: {} },
      ),
    ).resolves.toBeUndefined()
  })

  it('plugin exports exactly: config, tool.execute.before, tool.execute.after, experimental', async () => {
    const plugin = await AnvilPlugin()
    const keys = Object.keys(plugin).sort()
    expect(keys).toEqual(
      [
        'config',
        'experimental',
        'tool.execute.after',
        'tool.execute.before',
      ].sort(),
    )
  })
})
