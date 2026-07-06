/**
 * tests/integration/parallel-orchestration.test.ts
 *
 * Contract tests for the @parallel background fan-out feature (Plan 30 F1–F3).
 *
 * These are FIXTURE-BASED tests — no real subagents are dispatched.
 * We verify the prompt-level contracts (directive section in orchestrator.md),
 * the skill body contracts (parser spec in read-background-results.md), and
 * the CLI option-parsing contracts (clamping logic in orchestrate.ts).
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { orchestrateCommand } from '../../src/commands/cli/orchestrate.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')

// ─── Fixture helpers ─────────────────────────────────────────────────────────

/**
 * Build a stub .anvil/background-results.md body with N result blocks
 * following the canonical format documented in agents/orchestrator.md.
 */
function buildFixtureResults(n: number): string {
  const blocks: string[] = []
  for (let i = 1; i <= n; i++) {
    const role = `analyst-${i}`
    const ts = `2026-04-25T1${i}:00:00Z`
    blocks.push(
      `## Result ${i} — ${role} — ${ts}\n\nFinding ${i}: some insight from ${role}.\n\n---`,
    )
  }
  return blocks.join('\n\n')
}

/**
 * Parse the canonical `## Result N — role — timestamp` heading blocks from
 * a background-results body string. Returns an array of parsed block metadata.
 *
 * This is the reference parser implementation described in the skill body of
 * skills/universal/read-background-results.md — tests below verify the skill
 * body documents this exact pattern.
 */
function parseResultBlocks(
  content: string,
): Array<{ index: number; role: string; timestamp: string; content: string }> {
  const blocks: Array<{
    index: number
    role: string
    timestamp: string
    content: string
  }> = []

  const lines = content.split('\n')
  let current: {
    index: number
    role: string
    timestamp: string
    lines: string[]
  } | null = null

  for (const line of lines) {
    const match = line.match(/^## Result (\d+) — (.+?) — (.+)$/)
    if (match) {
      if (current) {
        blocks.push({
          index: current.index,
          role: current.role,
          timestamp: current.timestamp,
          content: current.lines.join('\n').trim(),
        })
      }
      current = {
        index: Number.parseInt(match[1], 10),
        role: match[2],
        timestamp: match[3],
        lines: [],
      }
    } else if (current) {
      current.lines.push(line)
    }
  }

  if (current) {
    blocks.push({
      index: current.index,
      role: current.role,
      timestamp: current.timestamp,
      content: current.lines.join('\n').trim(),
    })
  }

  return blocks
}

// ─── F1: Orchestrator @parallel directive ─────────────────────────────────

describe('integration: orchestrator @parallel directive (F1)', () => {
  it('orchestrator.md contains the Parallel Background Pool section', async () => {
    const body = await readFile(
      join(REPO_ROOT, 'agents', 'orchestrator.md'),
      'utf-8',
    )
    expect(body).toContain('## Parallel Background Pool')
  })

  it('orchestrator.md documents the @parallel=N invocation pattern', async () => {
    const body = await readFile(
      join(REPO_ROOT, 'agents', 'orchestrator.md'),
      'utf-8',
    )
    expect(body).toContain('@parallel=')
  })

  it('orchestrator.md documents N-clamping to 5 with a warning', async () => {
    const body = await readFile(
      join(REPO_ROOT, 'agents', 'orchestrator.md'),
      'utf-8',
    )
    // The directive section must document the upper bound and the warning text
    expect(body).toContain('exceeds the dispatch limit of 5')
    expect(body).toContain('Clamping to 5')
  })

  it('orchestrator.md documents the ANVIL_BACKGROUND_RESULTS output path', async () => {
    const body = await readFile(
      join(REPO_ROOT, 'agents', 'orchestrator.md'),
      'utf-8',
    )
    // ANV-0134: the agent body references the artefact path via the
    // `${ANVIL_BACKGROUND_RESULTS}` token rather than the literal path.
    // The resolver in src/core/artifact-paths.ts maps the token to
    // `.anvil/background-results.md` under the project root at render time.
    expect(body).toContain('${ANVIL_BACKGROUND_RESULTS}')
  })

  it('orchestrator.md documents the canonical block header format', async () => {
    const body = await readFile(
      join(REPO_ROOT, 'agents', 'orchestrator.md'),
      'utf-8',
    )
    // The heading format: ## Result <i> — <agent-role> — <ISO-8601-timestamp>
    expect(body).toContain('## Result')
    expect(body).toMatch(/Result.*agent-role.*timestamp/)
  })

  it('orchestrator.md references read-background-results for synthesis', async () => {
    const body = await readFile(
      join(REPO_ROOT, 'agents', 'orchestrator.md'),
      'utf-8',
    )
    expect(body).toContain('read-background-results')
  })
})

// ─── F2: read-background-results skill ────────────────────────────────────

describe('integration: read-background-results skill (F2)', () => {
  it('skill file exists at skills/universal/read-background-results.md', async () => {
    const body = await readFile(
      join(REPO_ROOT, 'skills', 'universal', 'read-background-results.md'),
      'utf-8',
    )
    expect(body.length).toBeGreaterThan(100)
  })

  it('skill frontmatter marks user-invocable: false', async () => {
    const body = await readFile(
      join(REPO_ROOT, 'skills', 'universal', 'read-background-results.md'),
      'utf-8',
    )
    expect(body).toContain('user-invocable: false')
  })

  it('skill frontmatter uses group: orchestration', async () => {
    const body = await readFile(
      join(REPO_ROOT, 'skills', 'universal', 'read-background-results.md'),
      'utf-8',
    )
    expect(body).toContain('group: orchestration')
  })

  it('skill body documents the heading parser pattern', async () => {
    const body = await readFile(
      join(REPO_ROOT, 'skills', 'universal', 'read-background-results.md'),
      'utf-8',
    )
    // The skill must document the regex/pattern that identifies blocks
    expect(body).toContain('## Result')
    // The skill body documents the pattern using \d+ (regex notation)
    expect(body).toMatch(/\\d\+/)
  })

  it('skill body documents deduplication rules', async () => {
    const body = await readFile(
      join(REPO_ROOT, 'skills', 'universal', 'read-background-results.md'),
      'utf-8',
    )
    expect(body.toLowerCase()).toContain('deduplicat')
  })

  it('skill body documents conflict resolution (newest timestamp wins)', async () => {
    const body = await readFile(
      join(REPO_ROOT, 'skills', 'universal', 'read-background-results.md'),
      'utf-8',
    )
    expect(body.toLowerCase()).toContain('timestamp')
    expect(body.toLowerCase()).toContain('conflict')
  })

  it('fixture parser correctly extracts 3 blocks from a stub file', () => {
    const fixture = buildFixtureResults(3)
    const blocks = parseResultBlocks(fixture)

    expect(blocks).toHaveLength(3)
    expect(blocks[0].index).toBe(1)
    expect(blocks[0].role).toBe('analyst-1')
    expect(blocks[0].timestamp).toBe('2026-04-25T11:00:00Z')
    expect(blocks[0].content).toContain('Finding 1')

    expect(blocks[1].index).toBe(2)
    expect(blocks[1].role).toBe('analyst-2')

    expect(blocks[2].index).toBe(3)
    expect(blocks[2].role).toBe('analyst-3')
  })

  it('fixture parser extracts all N blocks for N=1,2,5', () => {
    for (const n of [1, 2, 5]) {
      const fixture = buildFixtureResults(n)
      const blocks = parseResultBlocks(fixture)
      expect(blocks).toHaveLength(n)
    }
  })
})

// ─── F3: anvil orchestrate --parallel CLI option ───────────────────────────

describe('integration: anvil orchestrate --parallel CLI (F3)', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    stdoutSpy?.mockRestore()
    stderrSpy?.mockRestore()
  })

  it('orchestrate --parallel=1 uses single-agent prompt (header shows "1 background agent")', async () => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await orchestrateCommand('audit the auth module', { parallel: '1' })

    const out = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    // Header shows "1 background agent" (singular)
    expect(out).toContain('Parallel: 1 background agent')
    // The injected prompt line uses "Task:" (not @parallel=) for N=1
    expect(out).toContain('Task: audit the auth module')
  })

  it('orchestrate --parallel=3 injects @parallel=3 directive into prompt', async () => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await orchestrateCommand('audit the auth module', { parallel: '3' })

    const out = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    // The injected directive appears in the prompt section after the divider
    expect(out).toContain('@parallel=3 audit the auth module')
    expect(out).toContain('Parallel: 3 background agents')
  })

  it('orchestrate --parallel=5 injects @parallel=5 directive (at the limit)', async () => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await orchestrateCommand('explore performance bottlenecks', {
      parallel: '5',
    })

    const out = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(out).toContain('@parallel=5 explore performance bottlenecks')
    // No warning at exactly 5
    const errOut = stderrSpy.mock.calls.map((c) => c[0]).join('')
    expect(errOut).not.toContain('Clamping')
  })

  it('orchestrate --parallel=6 clamps to 5 and emits a stderr warning', async () => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await orchestrateCommand('broad analysis goal', { parallel: '6' })

    const out = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    // Clamped to 5 — directive uses 5
    expect(out).toContain('@parallel=5 broad analysis goal')
    // Header shows 5 agents
    expect(out).toContain('Parallel: 5 background agents')

    const errOut = stderrSpy.mock.calls.map((c) => c[0]).join('')
    expect(errOut).toContain('Clamping to 5')
  })

  it('orchestrate --parallel=0 clamps to 1 (floor) with no warning', async () => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await orchestrateCommand('analyze codebase', { parallel: '0' })

    const out = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    // Floored to 1 → single-agent path: directive is "Task:" not "@parallel=N"
    expect(out).toContain('Task: analyze codebase')
    expect(out).toContain('Parallel: 1 background agent')
    // No warning for floor (only warn on ceiling breach)
    const errOut = stderrSpy.mock.calls.map((c) => c[0]).join('')
    expect(errOut).not.toContain('Clamping')
  })

  it('orchestrate omitting --parallel defaults to single-agent prompt', async () => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await orchestrateCommand('run default orchestration')

    const out = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(out).toContain('Task: run default orchestration')
    expect(out).toContain('Parallel: 1 background agent')
  })

  it('orchestrate --json emits a JSON payload with parallel field', async () => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await orchestrateCommand('json goal test', { parallel: '3', json: true })

    const out = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    const parsed = JSON.parse(out) as {
      agent: string
      parallel: number
      goal: string
    }
    expect(parsed.agent).toBe('orchestrator')
    expect(parsed.parallel).toBe(3)
    expect(parsed.goal).toBe('json goal test')
  })

  it('orchestrate slash command file exists with anvil orchestrate reference', async () => {
    const slashBody = await readFile(
      join(REPO_ROOT, 'src', 'commands', 'slash', 'orchestrate.md'),
      'utf-8',
    )
    expect(slashBody).toContain('anvil orchestrate')
    expect(slashBody).toContain('--parallel')
  })
})
