import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildInitCommand } from '../../src/commands/cli/init-command.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..', '..')
const binPath = join(repoRoot, 'bin', 'anvil.cjs')
const tsFixture = join(repoRoot, 'tests', 'fixtures', 'detect-ts-project')

/**
 * Extract long-flag names (without `--` prefix) from a command string.
 * Strips trailing comment portions (everything after `#`) first.
 * E.g. `anvil init --preset balanced  # note` → `['preset']`
 */
function extractFlagNames(cmd: string): string[] {
  const commandPart = cmd.split('#')[0]
  const matches = commandPart.match(/--([a-z][-a-z]*)/g) ?? []
  return matches.map((m) => m.replace(/^--/, ''))
}

/**
 * Collect the set of declared long-option names from the `anvil init` command.
 * E.g. `--preset` → `preset`, `--no-tui` → `no-tui`.
 */
function initDeclaredFlags(): Set<string> {
  const cmd = buildInitCommand()
  return new Set(
    cmd.options
      .map((o) => o.long?.replace(/^--/, '') ?? '')
      .filter((name) => name.length > 0),
  )
}

describe('integration: anvil recommend', () => {
  it('--json emits parseable JSON with recommendations and context', () => {
    const output = execSync(`node ${binPath} recommend ${tsFixture} --json`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const parsed = JSON.parse(output) as {
      recommendations: Array<{
        slug: string
        surface: string
        score: number
        install_cmd: string
        reasons: string[]
      }>
      context: { languages: Array<{ name: string }>; frameworks: string[] }
      topN: number
    }
    expect(parsed.recommendations.length).toBeGreaterThan(0)
    expect(Array.isArray(parsed.context.languages)).toBe(true)
  })

  it('recommends typescript-coding for the TS+React fixture', () => {
    const output = execSync(`node ${binPath} recommend ${tsFixture} --json`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const parsed = JSON.parse(output) as {
      recommendations: Array<{ slug: string; install_cmd: string }>
    }
    const slugs = parsed.recommendations.map((r) => r.slug)
    expect(slugs).toContain('typescript-coding')
    const ts = parsed.recommendations.find(
      (r) => r.slug === 'typescript-coding',
    )
    // install_cmd must NOT contain fabricated flags (--skill/--hook/--agent/--mcp).
    // It must be a valid `anvil init` invocation. ANV-0015 / ANV-0063.
    expect(ts?.install_cmd).toContain('anvil init')
    expect(ts?.install_cmd).not.toContain('--skill')
    expect(ts?.install_cmd).not.toContain('--hook')
    expect(ts?.install_cmd).not.toContain('--agent')
    expect(ts?.install_cmd).not.toContain('--mcp')
  })

  it('--surface skills filters out non-skill recommendations', () => {
    const output = execSync(
      `node ${binPath} recommend ${tsFixture} --surface skills --json`,
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const parsed = JSON.parse(output) as {
      recommendations: Array<{ surface: string }>
    }
    for (const r of parsed.recommendations) {
      expect(r.surface).toBe('skill')
    }
  })

  it('table mode exits 0 and includes a surface section header', () => {
    const output = execSync(
      `node ${binPath} recommend ${tsFixture} --no-color`,
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    expect(output).toContain('Skills')
    expect(output).toContain('typescript-coding')
  })

  it('--top N limits the number of recommendations', () => {
    const output = execSync(
      `node ${binPath} recommend ${tsFixture} --json --top 2`,
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const parsed = JSON.parse(output) as {
      recommendations: unknown[]
      topN: number
    }
    expect(parsed.recommendations.length).toBeLessThanOrEqual(2)
    expect(parsed.topN).toBe(2)
  })

  it('every install_cmd flag is a declared anvil init flag', () => {
    const output = execSync(`node ${binPath} recommend ${tsFixture} --json`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const parsed = JSON.parse(output) as {
      recommendations: Array<{ slug: string; install_cmd: string }>
    }

    const declared = initDeclaredFlags()
    // Sanity: we must have parsed at least the known flags
    expect(declared.size).toBeGreaterThan(0)

    for (const rec of parsed.recommendations) {
      const flagNames = extractFlagNames(rec.install_cmd)
      for (const flag of flagNames) {
        expect(
          declared.has(flag),
          `install_cmd for "${rec.slug}" uses unknown flag --${flag}. ` +
            `Declared init flags: ${[...declared].map((f) => `--${f}`).join(', ')}`,
        ).toBe(true)
      }
    }
  })
})
