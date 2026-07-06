import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseAgentFile } from '../../../src/opencode-plugin/agents/parse.js'
import { loadAgents } from '../../../src/opencode-plugin/agents/registry.js'

// ─── parseAgentFile unit tests ────────────────────────────────────────────────

describe('parseAgentFile', () => {
  it('parses a valid agent file', () => {
    const content = `---
name: my-agent
description: A test agent
tools: [Read, Glob]
color: blue
---

You are my-agent. Do helpful things.`
    const result = parseAgentFile(content, 'test.md')
    expect(result).not.toBeNull()
    expect(result!.slug).toBe('my-agent')
    expect(result!.description).toBe('A test agent')
    expect(result!.tools).toEqual(['Read', 'Glob'])
    expect(result!.systemBody).toBe('You are my-agent. Do helpful things.')
  })

  it('returns null when frontmatter delimiters are missing', () => {
    const result = parseAgentFile(
      'No frontmatter here\nJust body text',
      'bad.md',
    )
    expect(result).toBeNull()
  })

  it('returns null when name slug is invalid', () => {
    const content = `---
name: BadSlug
description: Invalid slug
---

Body.`
    const result = parseAgentFile(content, 'bad-slug.md')
    expect(result).toBeNull()
  })

  it('preserves extra frontmatter fields via passthrough', () => {
    const content = `---
name: my-agent
description: Test
unknown-field: some-value
tier: review
---

Body text.`
    const result = parseAgentFile(content, 'extra.md')
    // Should parse successfully — extra fields pass through
    expect(result).not.toBeNull()
    expect(result!.slug).toBe('my-agent')
  })

  it('returns null when only opening delimiter exists', () => {
    const content = `---
name: my-agent
description: No closing delimiter`
    const result = parseAgentFile(content)
    expect(result).toBeNull()
  })

  it('strips body text correctly with multi-line body', () => {
    const content = `---
name: code-reviewer
description: Reviews code
---

Line one.

Line two.

Line three.`
    const result = parseAgentFile(content)
    expect(result).not.toBeNull()
    expect(result!.systemBody).toBe('Line one.\n\nLine two.\n\nLine three.')
  })
})

// ─── loadAgents unit tests ────────────────────────────────────────────────────

describe('loadAgents', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = join(
      tmpdir(),
      `anvil-loader-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    await mkdir(join(tmpRoot, 'agents'), { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
  })

  it('loads all valid agent files from agents/ dir', async () => {
    await writeFile(
      join(tmpRoot, 'agents', 'alpha.md'),
      '---\nname: alpha-agent\ndescription: Agent alpha\n---\n\nAlpha body.',
    )
    await writeFile(
      join(tmpRoot, 'agents', 'beta.md'),
      '---\nname: beta-agent\ndescription: Agent beta\ntools: [Read]\n---\n\nBeta body.',
    )
    await writeFile(
      join(tmpRoot, 'agents', 'gamma.md'),
      '---\nname: gamma-agent\ndescription: Agent gamma\n---\n\nGamma body.',
    )

    const map = await loadAgents(tmpRoot)
    expect(map.size).toBe(3)
    expect(map.has('alpha-agent')).toBe(true)
    expect(map.has('beta-agent')).toBe(true)
    expect(map.has('gamma-agent')).toBe(true)
    expect(map.get('beta-agent')!.tools).toEqual(['Read'])
  })

  it('returns empty map when agents/ dir is missing (D-10)', async () => {
    const missingRoot = join(tmpdir(), `anvil-missing-${Date.now()}`)
    const map = await loadAgents(missingRoot)
    expect(map.size).toBe(0)
  })

  it('returns empty map when agents/ dir is empty (D-10)', async () => {
    const map = await loadAgents(tmpRoot)
    expect(map.size).toBe(0)
  })

  it('skips malformed files and loads valid ones', async () => {
    await writeFile(
      join(tmpRoot, 'agents', 'valid.md'),
      '---\nname: valid-agent\ndescription: Valid\n---\n\nValid body.',
    )
    await writeFile(
      join(tmpRoot, 'agents', 'malformed.md'),
      'No frontmatter delimiters at all.',
    )
    await writeFile(
      join(tmpRoot, 'agents', 'bad-slug.md'),
      '---\nname: BadSlug\ndescription: Bad slug\n---\n\nBad.',
    )

    const map = await loadAgents(tmpRoot)
    expect(map.size).toBe(1)
    expect(map.has('valid-agent')).toBe(true)
  })

  it('enforces slug regex — rejects uppercase', async () => {
    await writeFile(
      join(tmpRoot, 'agents', 'upper.md'),
      '---\nname: MyAgent\ndescription: Uppercase\n---\n\nBody.',
    )
    const map = await loadAgents(tmpRoot)
    expect(map.size).toBe(0)
  })

  it('loads fixtures from tests/fixtures dir', async () => {
    // Integration check: our committed fixture files parse correctly.
    const fixtureRoot = new URL(
      '../../../tests/fixtures/opencode-plugin',
      import.meta.url,
    ).pathname
    // We only have agents/ subdir in fixtures; need to pass the parent as rootDir.
    // fixtureRoot IS the rootDir (contains agents/).
    const map = await loadAgents(fixtureRoot)
    // a.md, b.md, c.md should load; bad.md should be skipped
    expect(map.size).toBe(3)
    expect(map.has('agent-a')).toBe(true)
    expect(map.has('agent-b')).toBe(true)
    expect(map.has('agent-c')).toBe(true)
  })
})
