/**
 * Plan 29 Phase F2 — statusline bash-parity integration tests.
 * Plan 34 A7 — bash-parity re-enabled with rich truecolor renderer.
 *
 * Runs 6 canonical fixtures through both:
 *   1. `tests/fixtures/statusline-bash-reference.sh` (versioned snapshot of the canonical bash renderer)
 *   2. Anvil's TypeScript rich renderer (renderRich — Plan 34 A2)
 *
 * Asserts ANSI-normalised structural equivalence. Time segments in
 * rate-limit windows vary by `date +%s`, so the comparison normalises
 * those to `<TIME>` placeholders before comparing.
 *
 * The bash comparison tests are skipped when:
 *   - bash 4+ is unavailable (`bash --version` fails or returns < 4)
 *   - jq is unavailable (the bash script depends on it)
 *   - the reference script is absent
 */

import { execSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderRich } from '../../src/core/statusline/render-rich.js'
import type { StatuslineInputT } from '../../src/core/statusline/schema.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')
const FIXTURES_DIR = join(REPO_ROOT, 'tests', 'fixtures', 'statusline')
const BASH_REF = join(
  REPO_ROOT,
  'tests',
  'fixtures',
  'statusline-bash-reference.sh',
)

// ─── ANSI normalisation ────────────────────────────────────────────────────
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '')

/**
 * Normalise time segments so dynamic "NNNdNh" / "Nh Nm" / "Nm" values
 * don't cause spurious mismatches between bash (uses live `date`) and TS.
 *
 * Patterns replaced: `(1422d5h)` -> `(<TIME>)`, `(2h30m)` -> `(<TIME>)`, etc.
 */
const normalizeTime = (s: string): string =>
  s.replace(/\(\d+[dhmsDHMS][0-9dhmsDHMS]*\)/g, '(<TIME>)')

const normalize = (s: string): string => normalizeTime(stripAnsi(s))

/**
 * Plan 34 A3 adds the effort segment to the TS rich renderer; the bash
 * reference does not render effort. Strip the " . <effort>" suffix when
 * doing TS-vs-bash comparison so the gradient/emoji/rate-limit content
 * can be compared byte-for-byte without the effort extension diverging.
 */
const normalizeForBashCompare = (s: string): string =>
  normalize(s).replace(/ · \S+/g, '')

// ─── Environment guards ────────────────────────────────────────────────────
function bashVersion(): number {
  try {
    const out = execSync('bash --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    const m = out.match(/version (\d+)\./)
    return m ? Number.parseInt(m[1], 10) : 0
  } catch {
    return 0
  }
}

function jqAvailable(): boolean {
  try {
    execSync('jq --version', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// Plan 34 A7: bash-vs-TS parity re-enabled. The rich truecolor TS renderer
// now matches the bash reference (after ANSI normalisation + effort strip).
const BASH_PARITY_DEFERRED = false
const BASH_AVAILABLE =
  !BASH_PARITY_DEFERRED &&
  existsSync(BASH_REF) &&
  bashVersion() >= 4 &&
  jqAvailable()

// ─── Bash runner ──────────────────────────────────────────────────────────
function runBashRef(fixtureJson: string): string {
  const result = spawnSync('bash', [BASH_REF], {
    input: fixtureJson,
    encoding: 'utf-8',
    timeout: 5000,
  })
  if (result.error) throw result.error
  return result.stdout
}

// ─── Fixture loader ───────────────────────────────────────────────────────
function loadFixture(name: string): StatuslineInputT {
  const path = join(FIXTURES_DIR, `${name}.json`)
  const raw = readFileSync(path, 'utf-8')
  return JSON.parse(raw) as StatuslineInputT
}

function fixtureJson(name: string): string {
  return readFileSync(join(FIXTURES_DIR, `${name}.json`), 'utf-8')
}

/**
 * Build a fixture with a live resets_at for bash comparison (bash uses
 * live `date +%s`; we compute `now + offset` to match).
 */
function withLiveResets(
  fixture: StatuslineInputT,
  fiveHourOffsetSec?: number,
  sevenDayOffsetSec?: number,
): { fixture: StatuslineInputT; json: string } {
  const now = Math.floor(Date.now() / 1000)
  const updated = JSON.parse(JSON.stringify(fixture)) as StatuslineInputT
  if (fiveHourOffsetSec !== undefined && updated.rate_limits?.five_hour) {
    updated.rate_limits.five_hour.resets_at = now + fiveHourOffsetSec
  }
  if (sevenDayOffsetSec !== undefined && updated.rate_limits?.seven_day) {
    updated.rate_limits.seven_day.resets_at = now + sevenDayOffsetSec
  }
  return { fixture: updated, json: JSON.stringify(updated) }
}

// ─── TS parity renderer ───────────────────────────────────────────────────
/**
 * Plan 34 A7: Bash-equivalent renderer now uses renderRich — the full truecolor
 * RGB-gradient port of the bash reference. The rich renderer covers all segments
 * the bash script emits: repo, branch, ctx bar + emoji, 7d, 5h, velocity, model.
 * Effort is additive (A3) and stripped when comparing against bash output.
 */
function renderBashEquivalent(
  input: StatuslineInputT,
  _nowSec?: number,
): string {
  return renderRich(input, {}, _nowSec)
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('statusline bash-parity -- fixture 1: opus + xhigh + no rate_limits', () => {
  const fixture = loadFixture('fixture-1-opus-xhigh-main')

  it('TS rich renderer produces model and effort segment', () => {
    // Rich renderer: no git repo/branch (fake cwd), no ctx, no rate limits
    const out = normalize(renderBashEquivalent(fixture))
    expect(out).toContain('Opus')
    expect(out).toContain('xhigh')
  })

  it('bash reference matches TS output', { skip: !BASH_AVAILABLE }, () => {
    if (!BASH_AVAILABLE) {
      console.log(
        '[skip] bash 4+ or jq unavailable -- skipping bash comparison',
      )
      return
    }
    const bashOut = normalize(
      runBashRef(fixtureJson('fixture-1-opus-xhigh-main')),
    )
    // A3 adds effort to TS; bash does not render effort -- compare without effort suffix
    const tsOut = normalizeForBashCompare(renderBashEquivalent(fixture))
    expect(bashOut).toBe(tsOut)
  })
})

describe('statusline bash-parity -- fixture 2: sonnet + high + tokens + 5h rate_limit', () => {
  it('TS rich renderer produces 5h rate-limit and model with effort', () => {
    const { fixture: live } = withLiveResets(
      loadFixture('fixture-2-sonnet-high-ratelimit'),
      9000, // 2h30m
    )
    const out = normalize(renderBashEquivalent(live))
    // Rich renderer: 5h:42%(<TIME>) | model . effort
    expect(out).toMatch(/5h:42%\(<TIME>\)/)
    expect(out).toContain('Sonnet')
    expect(out).toContain('high')
  })

  it('bash reference structural match', { skip: !BASH_AVAILABLE }, () => {
    if (!BASH_AVAILABLE) return
    const { fixture: live, json } = withLiveResets(
      loadFixture('fixture-2-sonnet-high-ratelimit'),
      9000,
    )
    const bashOut = normalize(runBashRef(json))
    const tsOut = normalizeForBashCompare(renderBashEquivalent(live))
    expect(bashOut).toBe(tsOut)
  })
})

describe('statusline bash-parity -- fixture 3: opus + max + 7d rate_limit at 80%', () => {
  it('TS rich renderer produces 7d rate-limit and model with effort', () => {
    const now = Math.floor(Date.now() / 1000)
    const { fixture: live } = withLiveResets(
      loadFixture('fixture-3-opus-max-7d'),
      undefined,
      183600, // ~2d3h
    )
    const out = normalize(renderBashEquivalent(live, now))
    // Rich renderer: 7d:80%(<TIME>) | model . effort
    expect(out).toMatch(/7d:80%\(<TIME>\)/)
    expect(out).toContain('Opus')
    expect(out).toContain('max')
  })

  it('bash reference structural match', { skip: !BASH_AVAILABLE }, () => {
    if (!BASH_AVAILABLE) return
    const { fixture: live, json } = withLiveResets(
      loadFixture('fixture-3-opus-max-7d'),
      undefined,
      183600,
    )
    const bashOut = normalize(runBashRef(json))
    const tsOut = normalizeForBashCompare(renderBashEquivalent(live))
    expect(bashOut).toBe(tsOut)
  })
})

describe('statusline bash-parity -- fixture 4: sonnet + medium + cost + ctx%', () => {
  const fixture = loadFixture('fixture-4-sonnet-medium-cost-ctx')

  it('TS rich renderer produces ctx bar, emoji, and model with effort', () => {
    // Rich renderer: <20-block bar> <emoji> 62% | model . effort
    const out = normalize(renderBashEquivalent(fixture))
    expect(out).toMatch(/62%/)
    expect(out).toContain('Sonnet')
    expect(out).toContain('medium')
  })

  it(
    'bash reference matches TS bash-equivalent output',
    { skip: !BASH_AVAILABLE },
    () => {
      if (!BASH_AVAILABLE) return
      const bashOut = normalize(
        runBashRef(fixtureJson('fixture-4-sonnet-medium-cost-ctx')),
      )
      const tsOut = normalizeForBashCompare(renderBashEquivalent(fixture))
      expect(bashOut).toBe(tsOut)
    },
  )
})

describe('statusline bash-parity -- fixture 5: opus + xhigh + worktree fields', () => {
  const fixture = loadFixture('fixture-5-opus-xhigh-worktree')

  it('TS rich renderer produces model and effort (worktree fields not in bash ref)', () => {
    // Rich renderer: no git repo/branch (fake cwd), no ctx, no rate limits
    const out = normalize(renderBashEquivalent(fixture))
    expect(out).toContain('Opus')
    expect(out).toContain('xhigh')
  })

  it(
    'bash reference matches TS bash-equivalent output',
    { skip: !BASH_AVAILABLE },
    () => {
      if (!BASH_AVAILABLE) return
      const bashOut = normalize(
        runBashRef(fixtureJson('fixture-5-opus-xhigh-worktree')),
      )
      const tsOut = normalizeForBashCompare(renderBashEquivalent(fixture))
      expect(bashOut).toBe(tsOut)
    },
  )
})

describe('statusline bash-parity -- fixture 6: free-tier (no rate_limits, no tokens)', () => {
  const fixture = loadFixture('fixture-6-free-tier')

  it('TS rich renderer produces model only (no rate_limits, no ctx)', () => {
    // Free tier: no rate limits, no ctx% -> only model segment
    const out = normalize(renderBashEquivalent(fixture))
    expect(out).toContain('Sonnet')
    expect(out).not.toMatch(/5h:/)
    expect(out).not.toMatch(/7d:/)
    expect(out).not.toMatch(/tok:/)
  })

  it(
    'bash reference matches TS output (free-tier Pro/Max-absent path)',
    { skip: !BASH_AVAILABLE },
    () => {
      if (!BASH_AVAILABLE) return
      const bashOut = normalize(runBashRef(fixtureJson('fixture-6-free-tier')))
      const tsOut = normalizeForBashCompare(renderBashEquivalent(fixture))
      expect(bashOut).toBe(tsOut)
    },
  )
})
