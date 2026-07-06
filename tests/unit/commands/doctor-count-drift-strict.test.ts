/**
 * ANV-0087 — `anvil doctor --strict` count-drift gate.
 *
 * Tests the three exported check functions and the aggregate pusher
 * (pushCountDriftChecks) that wires them into the doctor report.
 *
 * Filesystem-based tests use a tmp directory so no live Anvil tree is needed.
 */

import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getLatestReleaseTag } from '../../../src/commands/cli/doctor-checks/release.js'
import {
  COUNT_DRIFT_ROW_PREFIX,
  checkClaudeMdUserInvocableCap,
  checkReadmeCountDrift,
  checkSelfAuditStaleness,
  pushCountDriftChecks,
} from '../../../src/commands/cli/doctor.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

let tmpRoot: string

beforeEach(() => {
  tmpRoot = join(tmpdir(), `anvil-cds-${Date.now()}`)
  mkdirSync(tmpRoot, { recursive: true })
})

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

function write(relPath: string, content: string): void {
  const abs = join(tmpRoot, relPath)
  const dir = abs.substring(0, abs.lastIndexOf('/'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(abs, content, 'utf-8')
}

function touch(relPath: string, mtime: Date): void {
  const abs = join(tmpRoot, relPath)
  mkdirSync(abs.substring(0, abs.lastIndexOf('/')), { recursive: true })
  writeFileSync(abs, '', 'utf-8')
  utimesSync(abs, mtime, mtime)
}

// ─── checkReadmeCountDrift ────────────────────────────────────────────────────

describe('checkReadmeCountDrift', () => {
  it('returns skip when README.md absent', () => {
    mkdirSync(join(tmpRoot, 'skills', 'universal'), { recursive: true })
    mkdirSync(join(tmpRoot, 'agents'), { recursive: true })
    const r = checkReadmeCountDrift(tmpRoot)
    expect(r.status).toBe('skip')
  })

  it('returns skip when skills/ absent', () => {
    write('README.md', '# X\n')
    mkdirSync(join(tmpRoot, 'agents'), { recursive: true })
    const r = checkReadmeCountDrift(tmpRoot)
    expect(r.status).toBe('skip')
    expect(r.detail).toMatch(/skills\//)
  })

  it('pass when README counts match the live tree', () => {
    // Create 3 universal skills
    for (let i = 0; i < 3; i++) {
      write(`skills/universal/skill-${i}.md`, `---\nname: skill-${i}\n---\n`)
    }
    // 2 language skills across 1 stack
    write(
      'skills/languages/typescript/ts-skill.md',
      '---\nname: ts-skill\n---\n',
    )
    write(
      'skills/languages/typescript/ts-skill2.md',
      '---\nname: ts-skill2\n---\n',
    )
    // 2 agents
    write('agents/agent-1.md', '---\nname: agent-1\n---\n')
    write('agents/agent-2.md', '---\nname: agent-2\n---\n')
    // README with matching counts
    write(
      'README.md',
      '3 universal skills + 2 language skills across 1 stacks with 2 orchestration agents.\n',
    )
    const r = checkReadmeCountDrift(tmpRoot)
    expect(r.status).toBe('pass')
  })

  it('warn when universal skill count mismatches', () => {
    write('skills/universal/skill-1.md', '---\nname: s1\n---\n')
    write('skills/universal/skill-2.md', '---\nname: s2\n---\n')
    write('agents/agent-1.md', '---\nname: a1\n---\n')
    // README states 10 universal skills but only 2 exist
    write(
      'README.md',
      '10 universal skills + 0 language skills with 1 orchestration agents.\n',
    )
    const r = checkReadmeCountDrift(tmpRoot)
    expect(r.status).toBe('warn')
    expect(r.detail).toMatch(/universal skills/)
    expect(r.detail).toMatch(/10/)
    expect(r.detail).toMatch(/2/)
  })

  it('warn when agent count mismatches', () => {
    write('skills/universal/skill-1.md', '---\nname: s1\n---\n')
    write('agents/agent-1.md', '---\nname: a1\n---\n')
    // README claims 5 agents but only 1 exists
    write('README.md', '1 universal skills + 5 orchestration agents.\n')
    const r = checkReadmeCountDrift(tmpRoot)
    expect(r.status).toBe('warn')
    expect(r.detail).toMatch(/orchestration agents/)
  })

  it('ignores AGENTS.md and CLAUDE.md when counting skills', () => {
    write('skills/universal/skill-1.md', '---\nname: s1\n---\n')
    write('skills/universal/AGENTS.md', '# agents guidance\n')
    write('skills/universal/CLAUDE.md', '# claude guidance\n')
    write('agents/agent-1.md', '---\nname: a1\n---\n')
    // Only 1 real skill, 1 agent
    write('README.md', '1 universal skills with 1 orchestration agents.\n')
    const r = checkReadmeCountDrift(tmpRoot)
    expect(r.status).toBe('pass')
  })

  it('pass detail includes commandCount', () => {
    // Create minimal tree with matching README
    write('skills/universal/skill-1.md', '---\nname: s1\n---\n')
    write('agents/agent-1.md', '---\nname: a1\n---\n')
    // Register one top-level CLI command in src/index.ts (the authoritative
    // source — review fix counts registered commands, not cli/ files).
    write('src/index.ts', "program.command('my-command').action(() => {})\n")
    write('README.md', '1 universal skills with 1 orchestration agents.\n')
    const r = checkReadmeCountDrift(tmpRoot)
    expect(r.status).toBe('pass')
    expect(r.detail).toMatch(/commands=/)
  })

  it('review fix: scans AGENTS.md for stated counts when README lacks them', () => {
    write('skills/universal/skill-1.md', '---\nname: s1\n---\n')
    write('agents/agent-1.md', '---\nname: a1\n---\n')
    // Register 2 top-level commands in src/index.ts.
    write(
      'src/index.ts',
      [
        "program.command('cmd-a').action(() => {})",
        "program.command('cmd-b').action(() => {})",
      ].join('\n'),
    )
    // README has no command count stated.
    write('README.md', '1 universal skills with 1 orchestration agents.\n')
    // AGENTS.md states 5 commands (mismatch with 2 registered).
    write('AGENTS.md', '# Guide\nThere are 5 CLI commands available.\n')
    const r = checkReadmeCountDrift(tmpRoot)
    expect(r.status).toBe('warn')
    expect(r.detail).toMatch(/commands: AGENTS\.md says 5, found 2/)
  })

  it('review fix: commands drift detected from README', () => {
    write('skills/universal/skill-1.md', '---\nname: s1\n---\n')
    write('agents/agent-1.md', '---\nname: a1\n---\n')
    // Register 3 top-level commands.
    write(
      'src/index.ts',
      [
        "program.command('cmd-a').action(() => {})",
        "program.command('cmd-b').action(() => {})",
        "program.command('cmd-c').action(() => {})",
      ].join('\n'),
    )
    // README claims 10 CLI commands.
    write(
      'README.md',
      '1 universal skills with 1 orchestration agents and 10 CLI commands.\n',
    )
    const r = checkReadmeCountDrift(tmpRoot)
    expect(r.status).toBe('warn')
    expect(r.detail).toMatch(/commands: README says 10, found 3/)
  })

  it('review fix: counts subcommand groups as one top-level command', () => {
    write('skills/universal/skill-1.md', '---\nname: s1\n---\n')
    write('agents/agent-1.md', '---\nname: a1\n---\n')
    // One group with nested subcommands → counts as 1 top-level command.
    write(
      'src/index.ts',
      [
        "const modelsCmd = program.command('models')",
        "modelsCmd.command('list').action(() => {})",
        "modelsCmd.command('show').action(() => {})",
        'program.addCommand(buildInitCommand())',
      ].join('\n'),
    )
    // 2 commands registered: `models` group + `init` via addCommand.
    write(
      'README.md',
      '1 universal skills with 1 orchestration agents and 2 CLI commands.\n',
    )
    const r = checkReadmeCountDrift(tmpRoot)
    expect(r.status).toBe('pass')
  })

  it('review fix: decoy arrow-diagram prose does NOT fire a commands-drift row', () => {
    write('skills/universal/skill-1.md', '---\nname: s1\n---\n')
    write('agents/agent-1.md', '---\nname: a1\n---\n')
    // Register 7 top-level commands.
    write(
      'src/index.ts',
      ['a', 'b', 'c', 'd', 'e', 'f', 'g']
        .map((n) => `program.command('${n}').action(() => {})`)
        .join('\n'),
    )
    // README + AGENTS contain ONLY the layer-arrow diagram line — no labelled
    // command-count sentence. The matcher must NOT treat "4 commands" here as a
    // stated count (this was the perpetual false-positive bug).
    write('README.md', '1 universal skills with 1 orchestration agents.\n')
    write(
      'AGENTS.md',
      '# Arch\n\n0 core → 1 skills → 2 hooks → 3 agents → 4 commands → 5 adapters\n',
    )
    const r = checkReadmeCountDrift(tmpRoot)
    // No commands-count drift should be reported despite 7 != 4.
    expect(r.status).toBe('pass')
    expect(r.detail).not.toMatch(/commands: /)
    // The pass detail still reports the live command count.
    expect(r.detail).toMatch(/commands=7/)
  })
})

// ─── checkClaudeMdUserInvocableCap ───────────────────────────────────────────

describe('checkClaudeMdUserInvocableCap', () => {
  it('pass when count ≤ 15', () => {
    const r = checkClaudeMdUserInvocableCap(tmpRoot, 15)
    expect(r.status).toBe('pass')
  })

  it('pass when count is 0', () => {
    const r = checkClaudeMdUserInvocableCap(tmpRoot, 0)
    expect(r.status).toBe('pass')
  })

  it('warn when count = 16', () => {
    const r = checkClaudeMdUserInvocableCap(tmpRoot, 16)
    expect(r.status).toBe('warn')
    expect(r.detail).toMatch(/16/)
    expect(r.detail).toMatch(/15/)
  })

  it('warn when count is large', () => {
    const r = checkClaudeMdUserInvocableCap(tmpRoot, 99)
    expect(r.status).toBe('warn')
    expect(r.detail).toMatch(/99/)
  })
})

// ─── checkSelfAuditStaleness ──────────────────────────────────────────────────

describe('checkSelfAuditStaleness', () => {
  it('returns skip when self-audit absent', () => {
    const r = checkSelfAuditStaleness(tmpRoot)
    expect(r.status).toBe('skip')
    expect(r.detail).toMatch(/_anvil-self-audit/)
  })

  it('pass when self-audit is fresh (newer than any tree file)', () => {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // A source file with mtime = yesterday
    touch('src/commands/cli/doctor.ts', yesterday)

    // Self-audit with mtime = now (newer than source)
    touch('.anvil/audits/_anvil-self-audit.md', now)

    const r = checkSelfAuditStaleness(tmpRoot)
    expect(r.status).toBe('pass')
  })

  it('warn when self-audit is more than 7 days older than newest tree file', () => {
    const now = new Date()
    // A recent source file
    touch('src/commands/cli/doctor.ts', now)

    // Self-audit 10 days old
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
    touch('.anvil/audits/_anvil-self-audit.md', tenDaysAgo)

    const r = checkSelfAuditStaleness(tmpRoot)
    expect(r.status).toBe('warn')
    expect(r.detail).toMatch(/behind newest tree file/)
  })

  it('pass when audit is 6 days behind (within the 7-day window)', () => {
    const now = new Date()
    touch('src/commands/cli/doctor.ts', now)

    const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
    touch('.anvil/audits/_anvil-self-audit.md', sixDaysAgo)

    const r = checkSelfAuditStaleness(tmpRoot)
    // 6-day drift: newestMtime (now) - auditMtime (6d ago) = 6 days ≤ 7 days → pass
    expect(r.status).toBe('pass')
  })

  // ── ANV-0167: release-tag anchor branches ────────────────────────────────

  it('warn when audit predates last shipped release tag', () => {
    const now = new Date()
    // Audit dated 10 days ago
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
    touch('.anvil/audits/_anvil-self-audit.md', tenDaysAgo)

    // Inject a release tag committed 2 days ago (newer than the audit).
    const twoDaysAgoMs = now.getTime() - 2 * 24 * 60 * 60 * 1000
    const r = checkSelfAuditStaleness(tmpRoot, () => ({
      tag: 'v0.14.0',
      commitDateMs: twoDaysAgoMs,
    }))
    expect(r.status).toBe('warn')
    expect(r.detail).toMatch(/predates last shipped release v0\.14\.0/)
    expect(r.detail).toMatch(/refresh before next cut/)
  })

  it('pass when audit is newer than the latest release tag', () => {
    const now = new Date()
    // Audit dated today
    touch('.anvil/audits/_anvil-self-audit.md', now)

    // Tag committed 5 days ago
    const fiveDaysAgoMs = now.getTime() - 5 * 24 * 60 * 60 * 1000
    const r = checkSelfAuditStaleness(tmpRoot, () => ({
      tag: 'v0.14.0',
      commitDateMs: fiveDaysAgoMs,
    }))
    expect(r.status).toBe('pass')
    expect(r.detail).toMatch(/newer than last shipped release v0\.14\.0/)
  })

  it('falls back to tree-mtime check when no release tag is reachable', () => {
    const now = new Date()
    // Recent source file
    touch('src/commands/cli/doctor.ts', now)
    // Audit 10 days old
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
    touch('.anvil/audits/_anvil-self-audit.md', tenDaysAgo)

    // No release tag reachable → fallback path → 7-day window warn
    const r = checkSelfAuditStaleness(tmpRoot, () => null)
    expect(r.status).toBe('warn')
    // Fallback message format (legacy "behind newest tree file")
    expect(r.detail).toMatch(/behind newest tree file/)
  })

  it('fallback passes when tree drift is within 7-day window', () => {
    const now = new Date()
    touch('src/commands/cli/doctor.ts', now)
    const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
    touch('.anvil/audits/_anvil-self-audit.md', sixDaysAgo)

    const r = checkSelfAuditStaleness(tmpRoot, () => null)
    expect(r.status).toBe('pass')
    expect(r.detail).toMatch(/within 7-day window of tree/)
  })

  it('30d ceiling warns even when audit is newer than latest release tag', () => {
    const now = new Date()
    // Audit dated 40 days ago (older than ceiling)
    const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000)
    touch('.anvil/audits/_anvil-self-audit.md', fortyDaysAgo)

    // Tag committed 50 days ago (audit IS newer than tag — primary check
    // would otherwise pass). Ceiling should still fire.
    const fiftyDaysAgoMs = now.getTime() - 50 * 24 * 60 * 60 * 1000
    const r = checkSelfAuditStaleness(tmpRoot, () => ({
      tag: 'v0.13.5',
      commitDateMs: fiftyDaysAgoMs,
    }))
    expect(r.status).toBe('warn')
    expect(r.detail).toMatch(/> 30d ceiling/)
  })

  it('30d ceiling warns in fallback path even when tree drift is small', () => {
    const now = new Date()
    // Audit 40 days old
    const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000)
    touch('.anvil/audits/_anvil-self-audit.md', fortyDaysAgo)
    // Source file 39 days old (drift = 1d, well inside 7-day window)
    const thirtyNineDaysAgo = new Date(now.getTime() - 39 * 24 * 60 * 60 * 1000)
    touch('src/commands/cli/doctor.ts', thirtyNineDaysAgo)

    const r = checkSelfAuditStaleness(tmpRoot, () => null)
    expect(r.status).toBe('warn')
    expect(r.detail).toMatch(/> 30d ceiling/)
  })
})

// ─── ANV-0167: getLatestReleaseTag ───────────────────────────────────────────

describe('getLatestReleaseTag', () => {
  it('returns the newest semver tag and its commit date', () => {
    const exec = (...args: string[]): string => {
      if (args[0] === 'tag') return 'v0.14.0\nv0.13.5\nv0.13.4\n'
      if (args[0] === 'log') return '2026-05-15T12:45:54+03:00\n'
      throw new Error(`unexpected git call: ${args.join(' ')}`)
    }
    const r = getLatestReleaseTag(tmpRoot, exec)
    expect(r).not.toBeNull()
    expect(r?.tag).toBe('v0.14.0')
    expect(r?.commitDateMs).toBe(Date.parse('2026-05-15T12:45:54+03:00'))
  })

  it('returns null when no semver tag exists', () => {
    const exec = (...args: string[]): string => {
      if (args[0] === 'tag') return '\n'
      throw new Error(`unexpected git call: ${args.join(' ')}`)
    }
    const r = getLatestReleaseTag(tmpRoot, exec)
    expect(r).toBeNull()
  })

  it('returns null when git tag throws (no repo)', () => {
    const exec = (..._args: string[]): string => {
      throw new Error('not a git repository')
    }
    const r = getLatestReleaseTag(tmpRoot, exec)
    expect(r).toBeNull()
  })

  it('returns null when git log throws after a valid tag', () => {
    const exec = (...args: string[]): string => {
      if (args[0] === 'tag') return 'v0.14.0\n'
      throw new Error('log failed')
    }
    const r = getLatestReleaseTag(tmpRoot, exec)
    expect(r).toBeNull()
  })

  it('ignores non-semver tag entries', () => {
    const exec = (...args: string[]): string => {
      if (args[0] === 'tag') return 'random-tag\nnot-semver\nv0.14.0\nv0.13.5\n'
      if (args[0] === 'log') return '2026-05-15T12:45:54+03:00\n'
      throw new Error(`unexpected git call: ${args.join(' ')}`)
    }
    const r = getLatestReleaseTag(tmpRoot, exec)
    expect(r?.tag).toBe('v0.14.0')
  })

  it('returns null when commit-date is unparseable', () => {
    const exec = (...args: string[]): string => {
      if (args[0] === 'tag') return 'v0.14.0\n'
      if (args[0] === 'log') return 'not-a-date\n'
      throw new Error(`unexpected git call: ${args.join(' ')}`)
    }
    const r = getLatestReleaseTag(tmpRoot, exec)
    expect(r).toBeNull()
  })

  it('accepts pre-release / build-metadata semver suffixes', () => {
    const exec = (...args: string[]): string => {
      if (args[0] === 'tag') return 'v1.0.0-rc.1\nv0.14.0\n'
      if (args[0] === 'log') return '2026-05-15T12:45:54+03:00\n'
      throw new Error(`unexpected git call: ${args.join(' ')}`)
    }
    const r = getLatestReleaseTag(tmpRoot, exec)
    expect(r?.tag).toBe('v1.0.0-rc.1')
  })
})

// ─── pushCountDriftChecks ─────────────────────────────────────────────────────

describe('pushCountDriftChecks', () => {
  it('pushes exactly 3 rows', () => {
    const checks: Array<{ name: string; status: string; detail: string }> = []
    write('README.md', '# X\n')
    write('skills/universal/s.md', '')
    write('agents/a.md', '')
    pushCountDriftChecks(
      checks as Parameters<typeof pushCountDriftChecks>[0],
      tmpRoot,
      5,
      false,
    )
    expect(checks).toHaveLength(3)
  })

  it('row names all start with COUNT_DRIFT_ROW_PREFIX', () => {
    const checks: Array<{ name: string; status: string; detail: string }> = []
    write('README.md', '# X\n')
    write('skills/universal/s.md', '')
    write('agents/a.md', '')
    pushCountDriftChecks(
      checks as Parameters<typeof pushCountDriftChecks>[0],
      tmpRoot,
      5,
      false,
    )
    for (const c of checks) {
      expect(c.name).toMatch(new RegExp(`^${COUNT_DRIFT_ROW_PREFIX}`))
    }
  })

  it('non-strict mode: warn rows stay warn', () => {
    // 10 universal skills claimed in README, only 1 on disk
    write('skills/universal/skill-1.md', '---\nname: s1\n---\n')
    write('agents/a.md', '')
    write('README.md', '10 universal skills with 1 orchestration agents.\n')
    const checks: Array<{ name: string; status: string; detail: string }> = []
    pushCountDriftChecks(
      checks as Parameters<typeof pushCountDriftChecks>[0],
      tmpRoot,
      5,
      false,
    )
    const readmeRow = checks.find((c) => c.name.includes('README'))
    expect(readmeRow?.status).toBe('warn')
  })

  it('strict mode: warn rows are promoted to fail', () => {
    // Same drift scenario but strict=true
    write('skills/universal/skill-1.md', '---\nname: s1\n---\n')
    write('agents/a.md', '')
    write('README.md', '10 universal skills with 1 orchestration agents.\n')
    const checks: Array<{ name: string; status: string; detail: string }> = []
    pushCountDriftChecks(
      checks as Parameters<typeof pushCountDriftChecks>[0],
      tmpRoot,
      5,
      true,
    )
    const readmeRow = checks.find((c) => c.name.includes('README'))
    expect(readmeRow?.status).toBe('fail')
  })

  it('strict mode: user-invocable cap > 15 becomes fail', () => {
    write('README.md', '# X\n')
    write('skills/universal/s.md', '')
    write('agents/a.md', '')
    const checks: Array<{ name: string; status: string; detail: string }> = []
    // 20 user-invocable skills → cap exceeded
    pushCountDriftChecks(
      checks as Parameters<typeof pushCountDriftChecks>[0],
      tmpRoot,
      20,
      true,
    )
    const capRow = checks.find((c) => c.name.includes('user-invocable'))
    expect(capRow?.status).toBe('fail')
  })

  it('strict mode: pass rows are not affected', () => {
    // README exactly matches live tree (1 universal skill, 1 agent)
    write('skills/universal/skill-1.md', '---\nname: s1\n---\n')
    write('agents/a.md', '')
    write('README.md', '1 universal skills with 1 orchestration agents.\n')
    const checks: Array<{ name: string; status: string; detail: string }> = []
    // 5 user-invocable → below cap
    pushCountDriftChecks(
      checks as Parameters<typeof pushCountDriftChecks>[0],
      tmpRoot,
      5,
      true,
    )
    const readmeRow = checks.find((c) => c.name.includes('README'))
    expect(readmeRow?.status).toBe('pass')
    const capRow = checks.find((c) => c.name.includes('user-invocable'))
    expect(capRow?.status).toBe('pass')
  })

  it('COUNT_DRIFT_ROW_PREFIX is the expected constant', () => {
    expect(COUNT_DRIFT_ROW_PREFIX).toBe('Count drift')
  })
})
