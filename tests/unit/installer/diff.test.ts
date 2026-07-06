import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildContextFromRepo } from '../../../src/installer/context-from-repo.js'
import { diffAnvilHome } from '../../../src/installer/diff.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

let tmp: string

beforeAll(() => {
  tmp = createTestTmpDir('diff')
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('diffAnvilHome', () => {
  it('marks every staged file as new when anvilHome is empty', async () => {
    const ctx = await buildContextFromRepo({
      sourceKind: 'local',
      sourceValue: process.cwd(),
      scope: 'project',
      preset: 'balanced',
    })
    const empty = join(tmp, 'empty')
    const report = await diffAnvilHome(ctx, empty)
    expect(report.summary.new).toBeGreaterThan(0)
    expect(report.summary.changed).toBe(0)
    expect(report.summary.unchanged).toBe(0)
    expect(report.paths.every((p) => p.status === 'new')).toBe(true)
  }, 30_000)

  it('marks files unchanged when anvilHome content matches', async () => {
    const ctx = await buildContextFromRepo({
      sourceKind: 'local',
      sourceValue: process.cwd(),
      scope: 'project',
      preset: 'balanced',
    })
    const home = join(tmp, 'mirror')
    // Stage once into home and re-diff
    const { stageAnvilHome } = await import('../../../src/installer/stage.js')
    const staged = await stageAnvilHome(ctx)
    for (const f of staged.files) {
      const dest = join(home, f.relativePath)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, f.content)
    }
    const report = await diffAnvilHome(ctx, home)
    expect(report.summary.unchanged).toBeGreaterThan(0)
    expect(report.summary.changed).toBe(0)
    expect(report.summary.new).toBe(0)
    // No stale files — deletion count must be zero
    expect(report.summary.deleted).toBe(0)
  }, 30_000)

  it('reports stale files as deletions when present in anvilHome but absent from staged set', async () => {
    const ctx = await buildContextFromRepo({
      sourceKind: 'local',
      sourceValue: process.cwd(),
      scope: 'project',
      preset: 'balanced',
    })
    const home = join(tmp, 'stale')
    // Write all staged files so there are no new/changed entries
    const { stageAnvilHome } = await import('../../../src/installer/stage.js')
    const staged = await stageAnvilHome(ctx)
    for (const f of staged.files) {
      const dest = join(home, f.relativePath)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, f.content)
    }
    // Inject a stale file that is not in the staged set
    const staleDir = join(home, 'agents')
    mkdirSync(staleDir, { recursive: true })
    writeFileSync(join(staleDir, 'stale-agent-removed.md'), '# stale\n')

    const report = await diffAnvilHome(ctx, home)
    expect(report.summary.deleted).toBeGreaterThanOrEqual(1)
    const deleted = report.paths.filter((p) => p.status === 'deleted')
    expect(deleted.length).toBeGreaterThanOrEqual(1)
    expect(
      deleted.some((p) => p.relativePath === 'agents/stale-agent-removed.md'),
    ).toBe(true)
    // Stale file must not appear as new or changed
    expect(
      report.paths.find(
        (p) => p.relativePath === 'agents/stale-agent-removed.md',
      )?.status,
    ).toBe('deleted')
  }, 30_000)

  it('reports accurate deletion count proportional to stale files injected', async () => {
    const ctx = await buildContextFromRepo({
      sourceKind: 'local',
      sourceValue: process.cwd(),
      scope: 'project',
      preset: 'balanced',
    })
    const home = join(tmp, 'multi-stale')
    const { stageAnvilHome } = await import('../../../src/installer/stage.js')
    const staged = await stageAnvilHome(ctx)
    for (const f of staged.files) {
      const dest = join(home, f.relativePath)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, f.content)
    }
    // Inject two stale files in different subdirectories
    mkdirSync(join(home, 'skills/old-skill'), { recursive: true })
    writeFileSync(join(home, 'skills/old-skill/SKILL.md'), '# old\n')
    writeFileSync(join(home, 'skills/old-skill/index.md'), '# index\n')

    const report = await diffAnvilHome(ctx, home)
    expect(report.summary.deleted).toBeGreaterThanOrEqual(2)
  }, 30_000)

  it('does not report runtime/dist subtree entries as deletions', async () => {
    const ctx = await buildContextFromRepo({
      sourceKind: 'local',
      sourceValue: process.cwd(),
      scope: 'project',
      preset: 'balanced',
    })
    const home = join(tmp, 'runtime-excl')
    const { stageAnvilHome } = await import('../../../src/installer/stage.js')
    const staged = await stageAnvilHome(ctx)
    for (const f of staged.files) {
      const dest = join(home, f.relativePath)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, f.content)
    }
    // Write a fake runtime/dist file (mirrors what sync.ts copies via cp)
    mkdirSync(join(home, 'runtime/dist'), { recursive: true })
    writeFileSync(join(home, 'runtime/dist/anvil-bundle.cjs'), '// bundle\n')

    const report = await diffAnvilHome(ctx, home)
    const deletedPaths = report.paths
      .filter((p) => p.status === 'deleted')
      .map((p) => p.relativePath)
    expect(deletedPaths.every((p) => !p.startsWith('runtime/dist'))).toBe(true)
  }, 30_000)

  it('produces unified-diff-style preview lines on change', async () => {
    const ctx = await buildContextFromRepo({
      sourceKind: 'local',
      sourceValue: process.cwd(),
      scope: 'project',
      preset: 'balanced',
    })
    const home = join(tmp, 'tampered')
    const { stageAnvilHome } = await import('../../../src/installer/stage.js')
    const staged = await stageAnvilHome(ctx)
    // Write all but tamper the version file
    for (const f of staged.files) {
      const dest = join(home, f.relativePath)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(
        dest,
        f.relativePath === 'version' ? '0.0.0-tampered\n' : f.content,
      )
    }
    const report = await diffAnvilHome(ctx, home)
    const versionDiff = report.paths.find((p) => p.relativePath === 'version')
    expect(versionDiff?.status).toBe('changed')
    expect(versionDiff?.added).toBeGreaterThanOrEqual(1)
    expect(versionDiff?.removed).toBeGreaterThanOrEqual(1)
    expect(versionDiff?.preview).toMatch(/^[-+]/m)
  }, 30_000)
})
