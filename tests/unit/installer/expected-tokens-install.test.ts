import { rmSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runInstaller } from '../../../src/installer/install.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

/**
 * ANV-0114 — end-to-end: the installer renders an expected-token aggregate
 * line, populates `expectedTokens` on the summary, and emits a non-blocking
 * warning when the cumulative sum exceeds the configured threshold.
 *
 * Backward-compat critical: skills/agents without `expected_tokens` must
 * continue to install. We use --dry-run so the test exercises planning +
 * summary rendering without touching the user's home directory.
 */

const ROOT = createTestTmpDir('anv-0114-install')
const CWD = join(ROOT, 'project')
const HOME = join(ROOT, 'home')

beforeAll(async () => {
  await mkdir(CWD, { recursive: true })
  await mkdir(HOME, { recursive: true })
  // Make CWD look like a project root to keep the installer paths sane.
  await writeFile(join(CWD, 'package.json'), '{}\n', 'utf-8')
})

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
})

describe('runInstaller — expected_tokens aggregation', () => {
  it('returns an ExpectedTokensAggregate on the summary (dry-run)', async () => {
    const result = await runInstaller({
      target: 'both',
      scope: 'project',
      preset: 'balanced',
      cwd: CWD,
      home: HOME,
      dryRun: true,
    })
    expect(result.expectedTokens).toBeDefined()
    expect(result.expectedTokens.skillCount).toBeGreaterThan(0)
    expect(result.expectedTokens.agentCount).toBeGreaterThan(0)
    // Every bundled skill/agent should fall into the "unknown" bucket at
    // ticket-implementation time — the field is brand-new. The aggregator
    // surfaces the bucket counts so a later doctor row can warn on coverage.
    expect(
      result.expectedTokens.unknownSkillCount +
        result.expectedTokens.unknownAgentCount,
    ).toBeGreaterThan(0)
  })

  it('renders the canonical expected-tokens summary line', async () => {
    const result = await runInstaller({
      target: 'both',
      scope: 'project',
      preset: 'balanced',
      cwd: CWD,
      home: HOME,
      dryRun: true,
    })
    expect(result.expectedTokensLine).toMatch(
      /^selected \d+ skills? \+ \d+ agents? = ~/,
    )
    expect(result.expectedTokensLine).toContain('expected tokens')
  })

  it('does not warn when the cumulative known total is below threshold', async () => {
    // All bundled skills currently lack expected_tokens, so totalKnown = 0
    // which is below the default 50k threshold.
    const result = await runInstaller({
      target: 'both',
      scope: 'project',
      preset: 'balanced',
      cwd: CWD,
      home: HOME,
      dryRun: true,
    })
    expect(result.warnings.some((w) => w.includes('expected_tokens'))).toBe(
      false,
    )
  })
})
