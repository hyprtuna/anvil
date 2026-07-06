import { mkdir, rm, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearDiscoveryCache,
  resolveHookFiles,
} from '../../../src/opencode-plugin/hooks/discovery.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

describe('resolveHookFiles', () => {
  let tmpDir: string
  let globalHooksRoot: string
  let projectDir: string

  beforeEach(async () => {
    tmpDir = createTestTmpDir('discovery-test')
    globalHooksRoot = join(tmpDir, 'global-hooks')
    projectDir = join(tmpDir, 'project')
    await mkdir(projectDir, { recursive: true })
    process.env.ANVIL_GLOBAL_HOOKS_OVERRIDE = globalHooksRoot
    clearDiscoveryCache()
  })

  afterEach(async () => {
    process.env.ANVIL_GLOBAL_HOOKS_OVERRIDE = undefined
    clearDiscoveryCache()
    await rm(tmpDir, { recursive: true, force: true })
  })

  async function writeGlobalHook(kind: string, name: string): Promise<string> {
    const dir = join(globalHooksRoot, kind)
    await mkdir(dir, { recursive: true })
    const path = join(dir, name)
    await writeFile(path, `// global ${name}`)
    return path
  }

  async function writeProjectHook(kind: string, name: string): Promise<string> {
    const dir = join(projectDir, '.anvil', 'hooks', kind)
    await mkdir(dir, { recursive: true })
    const path = join(dir, name)
    await writeFile(path, `// project ${name}`)
    return path
  }

  it('returns empty list when both dirs are absent', async () => {
    const result = await resolveHookFiles(
      'pre-tool-use',
      join(tmpDir, 'no-such-project'),
    )
    expect(result).toEqual([])
  })

  it('returns global-only hooks when no project hooks exist', async () => {
    await writeGlobalHook('pre-tool-use', 'a.cjs')
    await writeGlobalHook('pre-tool-use', 'b.cjs')
    clearDiscoveryCache()

    const result = await resolveHookFiles('pre-tool-use', projectDir)
    expect(result).toHaveLength(2)
    expect(result.some((f) => f.endsWith('a.cjs'))).toBe(true)
    expect(result.some((f) => f.endsWith('b.cjs'))).toBe(true)
  })

  it('returns project-only hooks when no global hooks exist', async () => {
    await writeProjectHook('read-guard', 'hook.cjs')
    clearDiscoveryCache()

    const result = await resolveHookFiles('read-guard', projectDir)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatch(/hook\.cjs$/)
  })

  it('merges global and project hooks with project appended after global', async () => {
    await writeGlobalHook('prompt-guard', 'global-a.cjs')
    await writeProjectHook('prompt-guard', 'project-b.cjs')
    clearDiscoveryCache()

    const result = await resolveHookFiles('prompt-guard', projectDir)
    expect(result).toHaveLength(2)
    // global comes before project in the merged list
    expect(result[0]).toMatch(/global-a\.cjs$/)
    expect(result[1]).toMatch(/project-b\.cjs$/)
  })

  it('project hook overrides global hook with same basename', async () => {
    await writeGlobalHook('workflow-guard', 'no-rm-rf.cjs')
    await writeProjectHook('workflow-guard', 'no-rm-rf.cjs')
    clearDiscoveryCache()

    const result = await resolveHookFiles('workflow-guard', projectDir)
    // Only one file — project wins; global suppressed
    expect(result).toHaveLength(1)
    const content = result[0]
    expect(content).toContain('.anvil/hooks/workflow-guard/no-rm-rf.cjs')
    // Verify it's the project version (path contains projectDir)
    expect(result[0].startsWith(projectDir)).toBe(true)
  })

  it('non-.cjs files are excluded', async () => {
    const dir = join(projectDir, '.anvil', 'hooks', 'on-error')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'hook.cjs'), '// ok')
    await writeFile(join(dir, 'hook.js'), '// ignored')
    await writeFile(join(dir, 'hook.ts'), '// ignored')
    clearDiscoveryCache()

    const result = await resolveHookFiles('on-error', projectDir)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatch(/hook\.cjs$/)
  })

  it('returns empty when hook dir exists but has no .cjs files', async () => {
    const dir = join(projectDir, '.anvil', 'hooks', 'notification')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'readme.txt'), 'ignored')
    clearDiscoveryCache()

    const result = await resolveHookFiles('notification', projectDir)
    expect(result).toEqual([])
  })

  it('files are sorted alphabetically within each source', async () => {
    const dir = join(projectDir, '.anvil', 'hooks', 'post-tool-use')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'zzz.cjs'), '// z')
    await writeFile(join(dir, 'aaa.cjs'), '// a')
    await writeFile(join(dir, 'mmm.cjs'), '// m')
    clearDiscoveryCache()

    const result = await resolveHookFiles('post-tool-use', projectDir)
    const basenames = result.map((f) => f.split('/').pop())
    expect(basenames).toEqual(['aaa.cjs', 'mmm.cjs', 'zzz.cjs'])
  })

  it('cache returns same result on repeated call with same mtime', async () => {
    await writeProjectHook('phase-boundary', 'hook.cjs')
    clearDiscoveryCache()

    const r1 = await resolveHookFiles('phase-boundary', projectDir)
    const r2 = await resolveHookFiles('phase-boundary', projectDir)
    expect(r1).toEqual(r2)
  })

  it('cache is invalidated when directory mtime changes', async () => {
    const dir = join(projectDir, '.anvil', 'hooks', 'context-monitor')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'first.cjs'), '// first')
    clearDiscoveryCache()

    const r1 = await resolveHookFiles('context-monitor', projectDir)
    expect(r1).toHaveLength(1)

    // Write a new file and bump the directory mtime manually
    await writeFile(join(dir, 'second.cjs'), '// second')
    const future = new Date(Date.now() + 10_000)
    await utimes(dir, future, future)
    clearDiscoveryCache()

    const r2 = await resolveHookFiles('context-monitor', projectDir)
    expect(r2).toHaveLength(2)
  })
})
