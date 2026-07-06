/**
 * ANV-0007 — Unit tests for the doc-drift lint engine.
 *
 * Tests are deterministic and require no network I/O.
 * Each check is exercised independently via a temporary fixture structure
 * built in memory using a mock project root (os.tmpdir subdir).
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  KNOWN_ANVIL_COMMANDS,
  checkAnvilCommandRefs,
  checkAtRefResolvability,
  checkHookFieldStaleness,
  checkInternalLinks,
  checkSkillFileRefs,
  checkTemplateFileRefs,
  collectDocFiles,
  formatDocDriftSummary,
  runDocDriftLint,
} from '../../../src/core/docs/lint/index.js'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let tmpRoot: string

beforeEach(() => {
  tmpRoot = join(tmpdir(), `anvil-doc-drift-${Date.now()}`)
  mkdirSync(tmpRoot, { recursive: true })
})

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

function write(relPath: string, content: string): string {
  const abs = join(tmpRoot, relPath)
  mkdirSync(join(tmpRoot, relPath.split('/').slice(0, -1).join('/')), {
    recursive: true,
  })
  writeFileSync(abs, content, 'utf-8')
  return abs
}

// ---------------------------------------------------------------------------
// collectDocFiles
// ---------------------------------------------------------------------------

describe('collectDocFiles', () => {
  it('returns README.md and docs/*.md only', () => {
    write('README.md', '# hi')
    write('docs/getting-started.md', '# gs')
    write('docs/anvil/internal.md', '# internal')
    write('docs/sub/nested.md', '# nested')

    const files = collectDocFiles(tmpRoot)
    const rel = files.map((f) => f.replace(`${tmpRoot}/`, ''))
    expect(rel).toContain('README.md')
    expect(rel).toContain('docs/getting-started.md')
    // docs/anvil/internal.md is NOT returned (only top-level docs/*.md)
    expect(rel).not.toContain('docs/anvil/internal.md')
    expect(rel).not.toContain('docs/sub/nested.md')
  })

  it('returns empty array when no files exist', () => {
    expect(collectDocFiles(tmpRoot)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Check 1 — broken internal links
// ---------------------------------------------------------------------------

describe('checkInternalLinks', () => {
  it('flags a broken internal link', () => {
    const filePath = write(
      'README.md',
      '# x\n[Architecture](docs/architecture.md)\n',
    )
    const violations: Parameters<typeof checkInternalLinks>[3] = []
    checkInternalLinks(
      filePath,
      tmpRoot,
      ['# x', '[Architecture](docs/architecture.md)'],
      violations,
    )
    expect(violations).toHaveLength(1)
    expect(violations[0].rule).toBe('broken-link')
    expect(violations[0].detail).toContain('docs/architecture.md')
    expect(violations[0].line).toBe(2)
  })

  it('does not flag an existing file', () => {
    write('docs/getting-started.md', '# gs')
    const filePath = write('README.md', '[GS](docs/getting-started.md)\n')
    const violations: Parameters<typeof checkInternalLinks>[3] = []
    checkInternalLinks(
      filePath,
      tmpRoot,
      ['[GS](docs/getting-started.md)'],
      violations,
    )
    expect(violations).toHaveLength(0)
  })

  it('ignores http/https links', () => {
    const filePath = write('README.md', '[ext](https://example.com)\n')
    const violations: Parameters<typeof checkInternalLinks>[3] = []
    checkInternalLinks(
      filePath,
      tmpRoot,
      ['[ext](https://example.com)'],
      violations,
    )
    expect(violations).toHaveLength(0)
  })

  it('ignores fragment-only links', () => {
    const filePath = write('README.md', '[anchor](#section)\n')
    const violations: Parameters<typeof checkInternalLinks>[3] = []
    checkInternalLinks(filePath, tmpRoot, ['[anchor](#section)'], violations)
    expect(violations).toHaveLength(0)
  })

  it('skips a line with the doc-drift skip marker', () => {
    const filePath = write(
      'README.md',
      '[broken](does-not-exist.md) <!-- doc-drift: skip -->\n',
    )
    const violations: Parameters<typeof checkInternalLinks>[3] = []
    checkInternalLinks(
      filePath,
      tmpRoot,
      ['[broken](does-not-exist.md) <!-- doc-drift: skip -->'],
      violations,
    )
    expect(violations).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Check 2 — unknown anvil commands
// ---------------------------------------------------------------------------

describe('checkAnvilCommandRefs', () => {
  it('flags a nonexistent anvil subcommand', () => {
    const filePath = write(
      'docs/opencode-plugin.md',
      'updated by `anvil install-skill`\n',
    )
    const violations: Parameters<typeof checkAnvilCommandRefs>[3] = []
    checkAnvilCommandRefs(
      filePath,
      tmpRoot,
      ['updated by `anvil install-skill`'],
      violations,
    )
    expect(violations).toHaveLength(1)
    expect(violations[0].rule).toBe('unknown-command')
    expect(violations[0].detail).toContain('install-skill')
  })

  it('passes for known commands', () => {
    const filePath = write('docs/getting-started.md', 'Run `anvil doctor`\n')
    const violations: Parameters<typeof checkAnvilCommandRefs>[3] = []
    checkAnvilCommandRefs(filePath, tmpRoot, ['Run `anvil doctor`'], violations)
    expect(violations).toHaveLength(0)
  })

  it('skips line with doc-drift skip marker', () => {
    const filePath = write(
      'docs/test.md',
      '`anvil install-skill` <!-- doc-drift: skip -->\n',
    )
    const violations: Parameters<typeof checkAnvilCommandRefs>[3] = []
    checkAnvilCommandRefs(
      filePath,
      tmpRoot,
      ['`anvil install-skill` <!-- doc-drift: skip -->'],
      violations,
    )
    expect(violations).toHaveLength(0)
  })

  it('KNOWN_ANVIL_COMMANDS includes expected commands', () => {
    expect(KNOWN_ANVIL_COMMANDS.has('doctor')).toBe(true)
    expect(KNOWN_ANVIL_COMMANDS.has('init')).toBe(true)
    expect(KNOWN_ANVIL_COMMANDS.has('skill')).toBe(true)
    expect(KNOWN_ANVIL_COMMANDS.has('install-skill')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Check 3 — missing skill file references
// ---------------------------------------------------------------------------

describe('checkSkillFileRefs', () => {
  it('flags a reference to a missing skill file', () => {
    const filePath = write(
      'docs/skill-authoring.md',
      'template is `skills/universal/planner.md`\n',
    )
    const violations: Parameters<typeof checkSkillFileRefs>[3] = []
    checkSkillFileRefs(
      filePath,
      tmpRoot,
      ['template is `skills/universal/planner.md`'],
      violations,
    )
    expect(violations).toHaveLength(1)
    expect(violations[0].rule).toBe('missing-skill-file')
    expect(violations[0].detail).toContain('skills/universal/planner.md')
  })

  it('passes when the skill file exists', () => {
    write('skills/universal/code-review.md', '---\nname: code-review\n---\n')
    const filePath = write(
      'docs/skill-authoring.md',
      'see `skills/universal/code-review.md`\n',
    )
    const violations: Parameters<typeof checkSkillFileRefs>[3] = []
    checkSkillFileRefs(
      filePath,
      tmpRoot,
      ['see `skills/universal/code-review.md`'],
      violations,
    )
    expect(violations).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Check 4 — missing template file refs
// ---------------------------------------------------------------------------

describe('checkTemplateFileRefs', () => {
  it('flags a template file listed in AGENTS.md that does not exist', () => {
    write(
      'templates/AGENTS.md',
      '## Files\n- `CLAUDE.md.template` — project CLAUDE.md.\n- `models.json.template` — baseline.\n',
    )
    const violations: Parameters<typeof checkTemplateFileRefs>[1] = []
    checkTemplateFileRefs(tmpRoot, violations)
    const rules = violations.map((v) => v.rule)
    expect(rules.every((r) => r === 'missing-template-file')).toBe(true)
    expect(violations.length).toBeGreaterThan(0)
    expect(
      violations.some((v) => v.detail.includes('CLAUDE.md.template')),
    ).toBe(true)
  })

  it('passes when all referenced template files exist', () => {
    write('templates/CLAUDE.md.template', 'hello')
    write('templates/models.json.template', '{}')
    write(
      'templates/AGENTS.md',
      '- `CLAUDE.md.template`\n- `models.json.template`\n',
    )
    const violations: Parameters<typeof checkTemplateFileRefs>[1] = []
    checkTemplateFileRefs(tmpRoot, violations)
    expect(violations).toHaveLength(0)
  })

  it('skips templates/AGENTS.md when file-level skip marker is present', () => {
    write(
      'templates/AGENTS.md',
      '<!-- doc-drift: skip -->\n- `CLAUDE.md.template`\n',
    )
    const violations: Parameters<typeof checkTemplateFileRefs>[1] = []
    checkTemplateFileRefs(tmpRoot, violations)
    expect(violations).toHaveLength(0)
  })

  it('is a no-op when templates/AGENTS.md does not exist', () => {
    const violations: Parameters<typeof checkTemplateFileRefs>[1] = []
    checkTemplateFileRefs(tmpRoot, violations)
    expect(violations).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Check 5 — stale hook field names
// ---------------------------------------------------------------------------

describe('checkHookFieldStaleness', () => {
  it('flags stale ctx.skillName reference', () => {
    const filePath = write(
      'docs/hook-authoring.md',
      '  // ctx.skillName — active skill\n',
    )
    const violations: Parameters<typeof checkHookFieldStaleness>[3] = []
    checkHookFieldStaleness(
      filePath,
      tmpRoot,
      ['  // ctx.skillName — active skill'],
      violations,
    )
    expect(violations).toHaveLength(1)
    expect(violations[0].rule).toBe('stale-hook-field')
    expect(violations[0].detail).toContain('ctx.skillName')
  })

  it('flags stale ctx.prompt reference', () => {
    const filePath = write(
      'docs/hook-authoring.md',
      '  // ctx.prompt — user prompt\n',
    )
    const violations: Parameters<typeof checkHookFieldStaleness>[3] = []
    checkHookFieldStaleness(
      filePath,
      tmpRoot,
      ['  // ctx.prompt — user prompt'],
      violations,
    )
    expect(violations).toHaveLength(1)
    expect(violations[0].detail).toContain('ctx.prompt')
  })

  it('flags stale ctx.filePath reference', () => {
    const filePath = write(
      'docs/hook-authoring.md',
      '  // ctx.filePath — for post-edit\n',
    )
    const violations: Parameters<typeof checkHookFieldStaleness>[3] = []
    checkHookFieldStaleness(
      filePath,
      tmpRoot,
      ['  // ctx.filePath — for post-edit'],
      violations,
    )
    expect(violations).toHaveLength(1)
    expect(violations[0].detail).toContain('ctx.filePath')
  })

  it('flags stale HookResult output field in hook-authoring doc', () => {
    const filePath = write(
      'docs/hook-authoring.md',
      "  output: 'message shown'\n",
    )
    const violations: Parameters<typeof checkHookFieldStaleness>[3] = []
    checkHookFieldStaleness(
      filePath,
      tmpRoot,
      ["  output: 'message shown'"],
      violations,
    )
    expect(violations).toHaveLength(1)
    expect(violations[0].rule).toBe('stale-hook-field')
    expect(violations[0].detail).toContain('output')
  })

  it('does not flag real ctx fields', () => {
    const filePath = write(
      'docs/hook-authoring.md',
      '  ctx.cwd\n  ctx.config\n  ctx.env\n',
    )
    const violations: Parameters<typeof checkHookFieldStaleness>[3] = []
    checkHookFieldStaleness(
      filePath,
      tmpRoot,
      ['  ctx.cwd', '  ctx.config', '  ctx.env'],
      violations,
    )
    expect(violations).toHaveLength(0)
  })

  it('skips line with doc-drift skip marker', () => {
    const filePath = write(
      'docs/hook-authoring.md',
      '  ctx.skillName <!-- doc-drift: skip -->\n',
    )
    const violations: Parameters<typeof checkHookFieldStaleness>[3] = []
    checkHookFieldStaleness(
      filePath,
      tmpRoot,
      ['  ctx.skillName <!-- doc-drift: skip -->'],
      violations,
    )
    expect(violations).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Check 6 — @-ref resolvability
// ---------------------------------------------------------------------------

describe('checkAtRefResolvability', () => {
  it('flags an unresolvable @-ref', () => {
    const filePath = write(
      'docs/workflow-guide.md',
      'See @docs/architecture.md\n',
    )
    const violations: Parameters<typeof checkAtRefResolvability>[3] = []
    checkAtRefResolvability(
      filePath,
      tmpRoot,
      ['See @docs/architecture.md'],
      violations,
    )
    expect(violations).toHaveLength(1)
    expect(violations[0].rule).toBe('missing-at-ref')
    expect(violations[0].detail).toContain('@docs/architecture.md')
  })

  it('passes when the @-ref file exists', () => {
    write('docs/getting-started.md', '# gs')
    const filePath = write(
      'docs/workflow-guide.md',
      'See @docs/getting-started.md\n',
    )
    const violations: Parameters<typeof checkAtRefResolvability>[3] = []
    checkAtRefResolvability(
      filePath,
      tmpRoot,
      ['See @docs/getting-started.md'],
      violations,
    )
    expect(violations).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// runDocDriftLint — integration
// ---------------------------------------------------------------------------

describe('runDocDriftLint', () => {
  it('returns zero violations for a clean project', () => {
    write(
      'README.md',
      '# Anvil\n\nSee [getting started](docs/getting-started.md)\n',
    )
    write('docs/getting-started.md', '# Getting Started\n')
    const result = runDocDriftLint(tmpRoot)
    expect(result.violations).toHaveLength(0)
    expect(result.filesScanned).toBe(2)
  })

  it('catches broken docs/architecture.md reference', () => {
    write('README.md', '[Architecture](docs/architecture.md)\n')
    const result = runDocDriftLint(tmpRoot)
    const brokenLinks = result.violations.filter(
      (v) => v.rule === 'broken-link',
    )
    expect(brokenLinks.length).toBeGreaterThanOrEqual(1)
    expect(
      brokenLinks.some((v) => v.detail.includes('docs/architecture.md')),
    ).toBe(true)
  })

  it('catches nonexistent anvil install-skill command', () => {
    write('docs/opencode-plugin.md', 'updated by `anvil install-skill`\n')
    const result = runDocDriftLint(tmpRoot)
    const cmds = result.violations.filter((v) => v.rule === 'unknown-command')
    expect(cmds.length).toBeGreaterThanOrEqual(1)
    expect(cmds.some((v) => v.detail.includes('install-skill'))).toBe(true)
  })

  it('catches missing skills/universal/planner.md reference', () => {
    write(
      'docs/skill-authoring.md',
      'template is `skills/universal/planner.md`.\n',
    )
    const result = runDocDriftLint(tmpRoot)
    const missing = result.violations.filter(
      (v) => v.rule === 'missing-skill-file',
    )
    expect(missing.length).toBeGreaterThanOrEqual(1)
    expect(missing.some((v) => v.detail.includes('planner.md'))).toBe(true)
  })

  it('catches missing template files', () => {
    write('templates/AGENTS.md', '- `CLAUDE.md.template`\n')
    const result = runDocDriftLint(tmpRoot)
    const tpl = result.violations.filter(
      (v) => v.rule === 'missing-template-file',
    )
    expect(tpl.length).toBeGreaterThanOrEqual(1)
    expect(tpl.some((v) => v.detail.includes('CLAUDE.md.template'))).toBe(true)
  })

  it('catches stale hook field examples', () => {
    write(
      'docs/hook-authoring.md',
      '  // ctx.skillName — active skill\n  output: "msg"\n',
    )
    const result = runDocDriftLint(tmpRoot)
    const stale = result.violations.filter((v) => v.rule === 'stale-hook-field')
    expect(stale.length).toBeGreaterThanOrEqual(1)
  })

  it('skips a whole file with file-level skip marker', () => {
    write(
      'docs/historical.md',
      '<!-- doc-drift: skip -->\n[broken](docs/architecture.md)\n',
    )
    const result = runDocDriftLint(tmpRoot)
    const fromHistorical = result.violations.filter((v) =>
      v.file.includes('historical'),
    )
    expect(fromHistorical).toHaveLength(0)
  })

  it('provides counts per rule', () => {
    write('README.md', '[Architecture](docs/architecture.md)\n')
    const result = runDocDriftLint(tmpRoot)
    expect(result.counts['broken-link']).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// formatDocDriftSummary
// ---------------------------------------------------------------------------

describe('formatDocDriftSummary', () => {
  it('reports clean state', () => {
    const summary = formatDocDriftSummary({
      violations: [],
      filesScanned: 5,
      counts: {
        'broken-link': 0,
        'unknown-command': 0,
        'missing-skill-file': 0,
        'missing-template-file': 0,
        'stale-hook-field': 0,
        'missing-at-ref': 0,
      },
    })
    expect(summary).toContain('no drift found')
    expect(summary).toContain('5 file(s)')
  })

  it('includes violation count and rules', () => {
    const summary = formatDocDriftSummary({
      violations: [
        { file: 'README.md', line: 1, rule: 'broken-link', detail: 'x' },
        { file: 'README.md', line: 2, rule: 'unknown-command', detail: 'y' },
      ],
      filesScanned: 3,
      counts: {
        'broken-link': 1,
        'unknown-command': 1,
        'missing-skill-file': 0,
        'missing-template-file': 0,
        'stale-hook-field': 0,
        'missing-at-ref': 0,
      },
    })
    expect(summary).toContain('2 violation(s)')
    expect(summary).toContain('broken-link')
    expect(summary).toContain('unknown-command')
  })
})

// Anti-drift guard: KNOWN_ANVIL_COMMANDS must mirror the registered top-level
// `.command('<name>')` calls in src/index.ts. If a CLI command is added but
// not registered here, the lint engine itself becomes a doc-drift source —
// exactly the failure mode the engine is meant to catch.
//
// Top-level commands are those attached to `program` directly. Subcommands
// (e.g. `models list`) attach to a captured handle (`modelsCmd.command('list')`)
// and must NOT be added to KNOWN_ANVIL_COMMANDS, so we filter by subject.
describe('KNOWN_ANVIL_COMMANDS — registry parity', () => {
  it('contains every top-level command registered in src/index.ts', () => {
    const indexPath = resolve(__dirname, '../../../src/index.ts')
    const src = readFileSync(indexPath, 'utf-8')

    const registered = new Set<string>()
    // Match `<subject>...<.command('name')>` allowing for newline-and-indent
    // chains. Subject is the identifier (or `= <id>`) that immediately
    // precedes the `.command(` call. Only `program` qualifies as top-level.
    const re = /(\b\w+)\s*(?:\n\s*)?\.command\(['"]([\w-]+)/g
    for (const m of src.matchAll(re)) {
      const subject = m[1]
      const cmd = m[2]
      if (subject === 'program') registered.add(cmd)
    }

    expect(
      registered.size,
      'parity guard could not find any top-level program.command(...) calls — regex broken?',
    ).toBeGreaterThan(0)

    const missing: string[] = []
    for (const cmd of registered) {
      if (!KNOWN_ANVIL_COMMANDS.has(cmd)) missing.push(cmd)
    }
    expect(
      missing,
      `KNOWN_ANVIL_COMMANDS is out of sync with src/index.ts. Add: ${missing.join(', ')}`,
    ).toEqual([])
  })
})
