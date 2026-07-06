import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { flipSlateStatus } from '../../../../../src/core/release/flip-slate-status.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

function makeSlateFixture(version: string, statusLine: string): string {
  const root = createTestTmpDir('flip-slate')
  const releasesDir = join(root, 'docs', 'anvil', 'releases')
  mkdirSync(releasesDir, { recursive: true })
  const content = `# v${version}\n\n${statusLine}\n\n## Slate\n\nSome content here.\n`
  writeFileSync(join(releasesDir, `v${version}.md`), content, 'utf-8')
  return root
}

describe('flipSlateStatus', () => {
  it('replaces "Status: planned" with "Status: released <date>"', () => {
    const root = makeSlateFixture('0.13.4', 'Status: planned')
    flipSlateStatus(root, '0.13.4', '2026-05-14')
    const content = readFileSync(
      join(root, 'docs', 'anvil', 'releases', 'v0.13.4.md'),
      'utf-8',
    )
    expect(content).toContain('Status: released 2026-05-14')
    expect(content).not.toContain('Status: planned')
    rmSync(root, { recursive: true })
  })

  it('replaces "Status: in-progress" with "Status: released <date>"', () => {
    const root = makeSlateFixture('0.14.0', 'Status: in-progress')
    flipSlateStatus(root, '0.14.0', '2026-06-01')
    const content = readFileSync(
      join(root, 'docs', 'anvil', 'releases', 'v0.14.0.md'),
      'utf-8',
    )
    expect(content).toContain('Status: released 2026-06-01')
    expect(content).not.toContain('Status: in-progress')
    rmSync(root, { recursive: true })
  })

  it('replaces "Status: in progress" (space form, canonical per AGENTS.md) with "Status: released <date>"', () => {
    const root = makeSlateFixture('0.15.7', 'Status: in progress')
    flipSlateStatus(root, '0.15.7', '2026-05-17')
    const content = readFileSync(
      join(root, 'docs', 'anvil', 'releases', 'v0.15.7.md'),
      'utf-8',
    )
    expect(content).toContain('Status: released 2026-05-17')
    expect(content).not.toContain('Status: in progress')
    rmSync(root, { recursive: true })
  })

  it('throws when the slate is already released', () => {
    const root = makeSlateFixture('1.0.0', 'Status: released 2026-01-01')
    expect(() => flipSlateStatus(root, '1.0.0', '2026-05-14')).toThrow(
      'already marked as released',
    )
    rmSync(root, { recursive: true })
  })

  it('throws when the slate carries the legacy "shipped" vocabulary', () => {
    const root = makeSlateFixture('1.1.0', 'Status: shipped 2026-01-01')
    expect(() => flipSlateStatus(root, '1.1.0', '2026-05-14')).toThrow(
      'already marked as released',
    )
    rmSync(root, { recursive: true })
  })

  it('throws when no status line is found', () => {
    const root = makeSlateFixture('2.0.0', 'Theme: some theme')
    expect(() => flipSlateStatus(root, '2.0.0', '2026-05-14')).toThrow(
      'no "Status: planned"',
    )
    rmSync(root, { recursive: true })
  })
})
