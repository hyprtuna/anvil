/**
 * ANV-0191 — Tests for docs/contributor-vs-user.md existence and content.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '../../..')
const FILE = join(ROOT, 'docs/contributor-vs-user.md')

describe('docs/contributor-vs-user.md', () => {
  it('exists', () => {
    expect(existsSync(FILE)).toBe(true)
  })

  it('links to scripts/dev/AGENTS.md', () => {
    const content = readFileSync(FILE, 'utf8')
    expect(content).toContain('scripts/dev/AGENTS.md')
  })

  it('references npm run dev:release', () => {
    const content = readFileSync(FILE, 'utf8')
    expect(content).toContain('npm run dev:release')
  })

  it('contains v0.15.3 surface migration table', () => {
    const content = readFileSync(FILE, 'utf8')
    expect(content).toContain('v0.15.3')
    expect(content).toContain('npm run dev:release')
    expect(content).toContain('npm run dev:worktree')
    expect(content).toContain('npm run dev:pr-branch')
    expect(content).toContain('npm run dev:skill-eval')
    expect(content).toContain('npm run dev:doctor')
  })

  it('covers at least 8 common contributor tasks', () => {
    const content = readFileSync(FILE, 'utf8')
    const tasks = [
      'build',
      'test',
      'lint',
      'status',
      'release',
      'skill',
      'agent',
      'doctor',
    ]
    const found = tasks.filter((t) => content.toLowerCase().includes(t))
    expect(found.length).toBeGreaterThanOrEqual(8)
  })
})
