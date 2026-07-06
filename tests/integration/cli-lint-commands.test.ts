import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestTmpDir } from '../helpers/tmpdir.js'

import { agentLintCommand } from '../../src/commands/cli/agent-lint.js'
import { hookLintCommand } from '../../src/commands/cli/hook-lint.js'
import { skillLintCommand } from '../../src/commands/cli/skill-lint.js'

describe('integration: anvil skill/agent/hook lint commands', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>
  let tmp: string
  let origCwd: string

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    tmp = createTestTmpDir('cli-lint')
    origCwd = process.cwd()
  })

  afterEach(async () => {
    writeSpy?.mockRestore()
    process.chdir(origCwd)
    await rm(tmp, { recursive: true, force: true })
  })

  // -------------------------------------------------------------------------
  // skill lint
  // -------------------------------------------------------------------------

  it('skill lint: prints "No skills found" when no roots exist', async () => {
    await skillLintCommand({
      cwd: tmp,
      anvilHome: join(tmp, '.anvil'),
    })
    const output = writeSpy.mock.calls.map((c) => String(c[0])).join('')
    expect(output).toContain('No skills found to lint')
  })

  it('skill lint: resolves and reports target count when .claude/skills exists', async () => {
    const skillsDir = join(tmp, '.claude', 'skills')
    await mkdir(skillsDir, { recursive: true })

    await skillLintCommand({
      cwd: tmp,
      anvilHome: join(tmp, '.anvil'),
    })

    const output = writeSpy.mock.calls.map((c) => String(c[0])).join('')
    expect(output).toContain('Linting 1 target')
    expect(output).toContain(skillsDir)
  })

  it('skill lint: --target overrides defaults', async () => {
    const targetDir = join(tmp, 'my-skills')
    await mkdir(targetDir, { recursive: true })

    await skillLintCommand({
      cwd: tmp,
      anvilHome: join(tmp, '.anvil'),
      target: targetDir,
    })

    const output = writeSpy.mock.calls.map((c) => String(c[0])).join('')
    expect(output).toContain(targetDir)
    expect(output).toContain('Linting 1 target')
  })

  it('skill lint --json: emits valid JSON with kind and roots', async () => {
    const skillsDir = join(tmp, '.claude', 'skills')
    await mkdir(skillsDir, { recursive: true })

    const captured: string[] = []
    writeSpy.mockImplementation((chunk) => {
      captured.push(String(chunk))
      return true
    })

    await skillLintCommand({
      cwd: tmp,
      anvilHome: join(tmp, '.anvil'),
      json: true,
    })

    const raw = captured.join('')
    const parsed = JSON.parse(raw) as unknown
    expect(parsed).toMatchObject({
      kind: 'skill',
      roots: expect.arrayContaining([skillsDir]),
    })
    // ANV-0184: results now contains check rows (previously empty placeholder)
    expect(Array.isArray((parsed as { results: unknown }).results)).toBe(true)
  })

  // -------------------------------------------------------------------------
  // agent lint
  // -------------------------------------------------------------------------

  it('agent lint: prints "No agents found" when no roots exist', async () => {
    await agentLintCommand({
      cwd: tmp,
      anvilHome: join(tmp, '.anvil'),
    })
    const output = writeSpy.mock.calls.map((c) => String(c[0])).join('')
    expect(output).toContain('No agents found to lint')
  })

  it('agent lint --json: emits valid JSON', async () => {
    const captured: string[] = []
    writeSpy.mockImplementation((chunk) => {
      captured.push(String(chunk))
      return true
    })

    await agentLintCommand({
      cwd: tmp,
      anvilHome: join(tmp, '.anvil'),
      json: true,
    })

    const raw = captured.join('')
    const parsed = JSON.parse(raw) as unknown
    expect(parsed).toMatchObject({ kind: 'agent', roots: [], results: [] })
  })

  // -------------------------------------------------------------------------
  // hook lint
  // -------------------------------------------------------------------------

  it('hook lint: prints "No hooks found" when no roots exist', async () => {
    await hookLintCommand({
      cwd: tmp,
      anvilHome: join(tmp, '.anvil'),
    })
    const output = writeSpy.mock.calls.map((c) => String(c[0])).join('')
    expect(output).toContain('No hooks found to lint')
  })

  it('hook lint --json: emits valid JSON', async () => {
    const captured: string[] = []
    writeSpy.mockImplementation((chunk) => {
      captured.push(String(chunk))
      return true
    })

    await hookLintCommand({
      cwd: tmp,
      anvilHome: join(tmp, '.anvil'),
      json: true,
    })

    const raw = captured.join('')
    const parsed = JSON.parse(raw) as unknown
    expect(parsed).toMatchObject({ kind: 'hook', roots: [], results: [] })
  })
})

// ---------------------------------------------------------------------------
// ANV-0184 — migrated check integration tests
// ---------------------------------------------------------------------------

describe('integration: migrated checks fire correctly', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>
  let tmp: string
  let origCwd: string

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    tmp = createTestTmpDir('cli-lint-184')
    origCwd = process.cwd()
  })

  afterEach(async () => {
    writeSpy?.mockRestore()
    process.chdir(origCwd)
    await rm(tmp, { recursive: true, force: true })
  })

  // ── skill lint checks ────────────────────────────────────────────────────

  it('skill lint: emits check results for a skills dir with a valid skill', async () => {
    const skillsDir = join(tmp, 'skills')
    await mkdir(skillsDir, { recursive: true })
    // Plant a minimal valid skill
    await writeFile(
      join(skillsDir, 'my-skill.md'),
      [
        '---',
        'name: my-skill',
        'description: Use when you need to test the skill lint checks.',
        'version: "1.0.0"',
        '---',
        '',
        '# My Skill',
        '',
        'Skill body content here.',
      ].join('\n'),
    )

    const captured: string[] = []
    writeSpy.mockImplementation((chunk) => {
      captured.push(String(chunk))
      return true
    })

    await skillLintCommand({
      cwd: tmp,
      anvilHome: join(tmp, '.anvil'),
      target: skillsDir,
      json: true,
    })

    const raw = captured.join('')
    const parsed = JSON.parse(raw) as {
      kind: string
      roots: string[]
      results: Array<{ name: string; status: string; detail: string }>
    }

    expect(parsed.kind).toBe('skill')
    expect(parsed.roots).toContain(skillsDir)
    expect(Array.isArray(parsed.results)).toBe(true)
    expect(parsed.results.length).toBeGreaterThan(0)

    // skill name uniqueness should be present
    const uniquenessCheck = parsed.results.find(
      (r) => r.name === 'skill name uniqueness',
    )
    expect(uniquenessCheck).toBeDefined()
    expect(uniquenessCheck?.status).toBe('pass')

    // CSO discipline should be present
    const csoCheck = parsed.results.find((r) => r.name === 'CSO discipline')
    expect(csoCheck).toBeDefined()

    // description budget should be present
    const budgetCheck = parsed.results.find(
      (r) => r.name === 'description budget',
    )
    expect(budgetCheck).toBeDefined()

    // 5 description-shape checks should all be present
    const descShapeNames = [
      'desc: CSO prefix',
      'desc: no step list',
      'desc: third-person voice',
      'desc: length sweet spot',
      'desc: no body dupe',
    ]
    for (const name of descShapeNames) {
      expect(parsed.results.find((r) => r.name === name)).toBeDefined()
    }
  })

  it('skill lint --json: results array is non-empty when skills dir exists', async () => {
    const skillsDir = join(tmp, '.claude', 'skills')
    await mkdir(skillsDir, { recursive: true })

    const captured: string[] = []
    writeSpy.mockImplementation((chunk) => {
      captured.push(String(chunk))
      return true
    })

    await skillLintCommand({
      cwd: tmp,
      anvilHome: join(tmp, '.anvil'),
      json: true,
    })

    const raw = captured.join('')
    const parsed = JSON.parse(raw) as { results: unknown[] }
    // Even an empty skills dir should produce check rows (pass/skip)
    expect(parsed.results.length).toBeGreaterThan(0)
  })

  // ── agent lint checks ────────────────────────────────────────────────────

  it('agent lint: emits check results for an agents dir', async () => {
    const agentsDir = join(tmp, 'agents')
    await mkdir(agentsDir, { recursive: true })

    const captured: string[] = []
    writeSpy.mockImplementation((chunk) => {
      captured.push(String(chunk))
      return true
    })

    await agentLintCommand({
      cwd: tmp,
      anvilHome: join(tmp, '.anvil'),
      target: agentsDir,
      json: true,
    })

    const raw = captured.join('')
    const parsed = JSON.parse(raw) as {
      kind: string
      roots: string[]
      results: Array<{ name: string; status: string }>
    }

    expect(parsed.kind).toBe('agent')
    expect(parsed.roots).toContain(agentsDir)
    expect(Array.isArray(parsed.results)).toBe(true)
    expect(parsed.results.length).toBeGreaterThan(0)

    // Required reading budget check should be present
    const budgetCheck = parsed.results.find(
      (r) => r.name === 'Required reading budget',
    )
    expect(budgetCheck).toBeDefined()

    // Required reading paths resolve check should be present
    const pathsCheck = parsed.results.find(
      (r) => r.name === 'Required reading paths resolve',
    )
    expect(pathsCheck).toBeDefined()

    // Agent permission taxonomy should be present
    const permCheck = parsed.results.find(
      (r) => r.name === 'Agent permission taxonomy',
    )
    expect(permCheck).toBeDefined()
  })

  // ── hook lint checks ─────────────────────────────────────────────────────

  it('hook lint: emits check results for a hooks dir', async () => {
    const hooksDir = join(tmp, 'hooks')
    await mkdir(hooksDir, { recursive: true })

    const captured: string[] = []
    writeSpy.mockImplementation((chunk) => {
      captured.push(String(chunk))
      return true
    })

    await hookLintCommand({
      cwd: tmp,
      anvilHome: join(tmp, '.anvil'),
      target: hooksDir,
      json: true,
    })

    const raw = captured.join('')
    const parsed = JSON.parse(raw) as {
      kind: string
      roots: string[]
      results: Array<{ name: string; status: string }>
    }

    expect(parsed.kind).toBe('hook')
    expect(parsed.roots).toContain(hooksDir)
    expect(Array.isArray(parsed.results)).toBe(true)
    expect(parsed.results.length).toBeGreaterThan(0)

    // Hook exit-code contract should be present and pass (pure logic check)
    const exitCodeCheck = parsed.results.find(
      (r) => r.name === 'hook exit-code contract',
    )
    expect(exitCodeCheck).toBeDefined()
    expect(exitCodeCheck?.status).toBe('pass')

    // Hook handler size should be present
    const sizeCheck = parsed.results.find((r) => r.name === 'Hook handler size')
    expect(sizeCheck).toBeDefined()
  })
})
