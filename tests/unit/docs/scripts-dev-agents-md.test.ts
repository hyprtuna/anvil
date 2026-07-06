/**
 * ANV-0191 — Tests for scripts/dev/AGENTS.md existence and content.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '../../..')
const AGENTS_FILE = join(ROOT, 'scripts/dev/AGENTS.md')
const CLAUDE_STUB = join(ROOT, 'scripts/dev/CLAUDE.md')

const EXPECTED_SCRIPTS = [
  'release.ts',
  'worktree.ts',
  'pr-branch.ts',
  'skill-eval.ts',
  'dev-doctor.ts',
  'test-agent.ts',
  'check-status.ts',
  'verify-skills.ts',
  'verify-agents.ts',
]

describe('scripts/dev/AGENTS.md', () => {
  it('exists', () => {
    expect(existsSync(AGENTS_FILE)).toBe(true)
  })

  it('contains all 9 script names in a table', () => {
    const content = readFileSync(AGENTS_FILE, 'utf8')
    for (const script of EXPECTED_SCRIPTS) {
      expect(content, `Missing script reference: ${script}`).toContain(script)
    }
  })

  it('contains the Output contract section', () => {
    const content = readFileSync(AGENTS_FILE, 'utf8')
    expect(content).toContain('## Output contract')
  })

  it('has at least 9 dev: npm script references', () => {
    const content = readFileSync(AGENTS_FILE, 'utf8')
    const matches = content.match(/dev:/g)
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(9)
  })
})

describe('scripts/dev/CLAUDE.md', () => {
  it('exists as a stub that imports AGENTS.md', () => {
    expect(existsSync(CLAUDE_STUB)).toBe(true)
    const content = readFileSync(CLAUDE_STUB, 'utf8')
    expect(content).toContain('@./AGENTS.md')
  })
})
