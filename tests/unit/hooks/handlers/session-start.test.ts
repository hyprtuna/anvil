import { cpSync, rmSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { getProjectScopedPath } from '../../../../src/core/io/project-scoped-paths.js'
import { HookResult } from '../../../../src/core/types.js'
import { sessionStartHandler } from '../../../../src/hooks/handlers/session-start.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const tsFixture = join(
  __dirname,
  '..',
  '..',
  '..',
  'fixtures',
  'detect-ts-project',
)

/**
 * Copy the tsFixture into a fresh tmpdir and invoke `fn` with the tmp path.
 * Cleans up in finally so the original fixture is never mutated.
 *
 * ANV-0160 Fix C: extends ANV-0145 redirect pattern to the remaining sites
 * in this file that previously called sessionStartHandler with the raw fixture
 * path. See .anvil/research/anv-0142-test-env-divergence.research.md RC-3.
 */
async function withFixtureCopy<T>(
  fn: (tmpPath: string) => Promise<T>,
): Promise<T> {
  const tmp = createTestTmpDir('session-fixture')
  try {
    cpSync(tsFixture, tmp, { recursive: true })
    return await fn(tmp)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

function makeCtx(cwd: string) {
  return {
    kind: 'session-start' as const,
    cwd,
    config: buildDefaultConfig(),
    env: {},
    payload: null,
  }
}

describe('hooks/handlers/session-start', () => {
  it('returns SUCCESS and detects project language', async () => {
    const result = await withFixtureCopy(async (tmp) =>
      sessionStartHandler(makeCtx(tmp)),
    )
    expect(result.exitCode).toBe(0)
    expect(result.message).toContain('typescript')
  })
})

// Plan 31 H4 — session-start handler contract tests
describe('hooks/handlers/session-start — H4 contract', () => {
  let tmpDir: string
  let fakeAnvilHome: string

  beforeEach(async () => {
    tmpDir = createTestTmpDir('h4-test')
    fakeAnvilHome = createTestTmpDir('h4-anvil-home')
    process.env.ANVIL_HOME = fakeAnvilHome
  })

  afterEach(async () => {
    // biome-ignore lint/performance/noDelete: process.env.ANVIL_HOME = undefined stores the string "undefined"; delete is the only way to unset an env var at runtime.
    delete process.env.ANVIL_HOME
    await rm(tmpDir, { recursive: true, force: true })
    await rm(fakeAnvilHome, { recursive: true, force: true })
  })

  it('H4-1: emits "anvil ready: <lang>[+frameworks]" message for a TS project', async () => {
    const result = await withFixtureCopy(async (tmp) =>
      sessionStartHandler(makeCtx(tmp)),
    )
    expect(result.exitCode).toBe(0)
    // Must start with "anvil ready:" and include a language name
    expect(result.message).toMatch(/^anvil ready: \w+/)
    expect(result.message).toContain('typescript')
  })

  it('H4-2: writes registry.json populated with skills + agents lists', async () => {
    // Use a tmpdir so we can inspect the written file without polluting the fixture
    await sessionStartHandler(makeCtx(tmpDir))
    const registryPath = await getProjectScopedPath(tmpDir, 'registry')
    const raw = await readFile(registryPath, 'utf-8')
    const registry = JSON.parse(raw) as {
      skills: unknown
      agents: unknown
      at: string
    }
    expect(Array.isArray(registry.skills)).toBe(true)
    expect(Array.isArray(registry.agents)).toBe(true)
    expect(typeof registry.at).toBe('string')
  })

  it('H4-3: writes project.json populated with detected project', async () => {
    await sessionStartHandler(makeCtx(tmpDir))
    const projectPath = await getProjectScopedPath(tmpDir, 'project')
    const raw = await readFile(projectPath, 'utf-8')
    const project = JSON.parse(raw) as {
      languages: Array<{ name: string }>
      detectedAt: string
    }
    expect(Array.isArray(project.languages)).toBe(true)
    expect(typeof project.detectedAt).toBe('string')
  })

  it('H4-4: when a notepad recent-context.md exists, systemInsert includes it', async () => {
    // Write a fake recent-context to the notepad location the handler looks for.
    // In a non-git tmpDir, detectBranch returns 'HEAD', and deriveBranchSlug('HEAD')
    // falls back to 'detached-unknown' when git rev-parse also fails. We initialise
    // a bare git repo so detectBranch returns a stable branch name instead. Strip
    // inherited GIT_* env vars (e.g. when this test runs inside a pre-push hook
    // where GIT_DIR points at the parent repo) so `git init` actually creates
    // .git inside tmpDir instead of re-initialising the parent.
    const { execSync } = await import('node:child_process')
    const cleanEnv = { ...process.env }
    for (const key of Object.keys(cleanEnv)) {
      if (key.startsWith('GIT_')) delete cleanEnv[key]
    }
    execSync('git init -b main', {
      cwd: tmpDir,
      env: cleanEnv,
      stdio: 'ignore',
    })

    const anvilDir = join(tmpDir, '.anvil')
    await mkdir(anvilDir, { recursive: true })

    // With 'git init -b main', detectBranch returns 'main' → slug is 'main'
    const notepadsDir = join(anvilDir, 'notepads', 'main')
    await mkdir(notepadsDir, { recursive: true })
    const recentContextPath = join(notepadsDir, 'recent-context.md')
    const testContent = '## Decisions\n- Used TypeScript strict mode\n'
    await writeFile(recentContextPath, testContent, 'utf-8')

    const result = await sessionStartHandler(makeCtx(tmpDir))
    expect(result.exitCode).toBe(0)
    // systemInsert should contain the recent-context content
    expect(result.systemInsert).toBeDefined()
    expect(result.systemInsert).toContain('Decisions')
  })

  it('H4-5: when no notepads exist, systemInsert is undefined', async () => {
    // tmpDir has no .anvil/notepads — nothing to load
    const result = await sessionStartHandler(makeCtx(tmpDir))
    expect(result.exitCode).toBe(0)
    // No notepad → systemInsert must not be set
    expect(result.systemInsert).toBeUndefined()
  })
})

// ANV-0019: phase-aware artifact context wire-up
describe('hooks/handlers/session-start — phase-aware artifact context', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = createTestTmpDir('anv-0019-session')
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('injects the artifact block into systemInsert when state has a phase + slug + spec file', async () => {
    // Seed `.anvil/state.json` so readState() returns an active phase.
    const anvilDir = join(tmpDir, '.anvil')
    await mkdir(anvilDir, { recursive: true })
    const state = {
      schema_version: 1,
      feature_slug: 'session-feature',
      phase: 'plan',
      completed_tasks: [],
      pending_tasks: [],
      updated_at: new Date().toISOString(),
    }
    await writeFile(
      join(anvilDir, 'state.json'),
      JSON.stringify(state),
      'utf-8',
    )

    // Seed spec.md + plan.md at the manifest-expected location.
    const featDir = join(anvilDir, 'specs', 'features', 'session-feature')
    await mkdir(featDir, { recursive: true })
    await writeFile(
      join(featDir, 'spec.md'),
      '---\ntitle: Session Feature\n---\n# Spec\n\nSpec body.\n',
      'utf-8',
    )
    await writeFile(join(featDir, 'plan.md'), '# Plan\n\nPlan body.\n', 'utf-8')

    const result = await sessionStartHandler(makeCtx(tmpDir))
    expect(result.exitCode).toBe(0)
    expect(result.systemInsert).toBeDefined()
    expect(result.systemInsert).toContain('Active artifacts')
    expect(result.systemInsert).toContain('### plan')
    expect(result.systemInsert).toContain('### spec')
  })

  it('does not inject artifact block when state.phase is none', async () => {
    const result = await sessionStartHandler(makeCtx(tmpDir))
    expect(result.exitCode).toBe(0)
    // With no .anvil/state.json, phase defaults to 'none' → no artifact block.
    // systemInsert may be undefined OR set by another mechanism, but it
    // must NOT contain the artifact block header.
    if (result.systemInsert) {
      expect(result.systemInsert).not.toContain('Active artifacts')
    }
  })

  it('returns exitCode 0 even when feature artefacts are missing', async () => {
    // Phase=plan but the feature directory does not exist → required
    // artefact warning, but session-start must not abort.
    const anvilDir = join(tmpDir, '.anvil')
    await mkdir(anvilDir, { recursive: true })
    const state = {
      schema_version: 1,
      feature_slug: 'missing-slug',
      phase: 'plan',
      completed_tasks: [],
      pending_tasks: [],
      updated_at: new Date().toISOString(),
    }
    await writeFile(
      join(anvilDir, 'state.json'),
      JSON.stringify(state),
      'utf-8',
    )

    const result = await sessionStartHandler(makeCtx(tmpDir))
    expect(result.exitCode).toBe(0)
  })
})

// ANV-0118: compactable structural sections wired into handler output
describe('hooks/handlers/session-start — structural compaction', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = createTestTmpDir('anv-0118-session')
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('strips bloated <anvil_skills> section from notepad-derived systemInsert when budget is tight', async () => {
    // Seed a notepad recent-context.md containing a giant <anvil_skills>
    // block plus surrounding non-structural content. Set config.budget_chars
    // small enough to force compaction.
    const { execSync } = await import('node:child_process')
    const cleanEnv = { ...process.env }
    for (const key of Object.keys(cleanEnv)) {
      if (key.startsWith('GIT_')) delete cleanEnv[key]
    }
    execSync('git init -b main', {
      cwd: tmpDir,
      env: cleanEnv,
      stdio: 'ignore',
    })

    const notepadsDir = join(tmpDir, '.anvil', 'notepads', 'main')
    await mkdir(notepadsDir, { recursive: true })
    const big = 'S'.repeat(1500)
    const recent = `## Decisions\n- Keep this line\n<anvil_skills>\n${big}\n</anvil_skills>\n- Tail line\n`
    await writeFile(join(notepadsDir, 'recent-context.md'), recent, 'utf-8')

    const ctx = makeCtx(tmpDir)
    // Tighten the budget so compaction must run.
    ctx.config = {
      ...ctx.config,
      hooks: {
        timeout_seconds: 30,
        session_start: { budget_chars: 400 },
      },
    }

    const result = await sessionStartHandler(ctx)
    expect(result.exitCode).toBe(0)
    expect(result.systemInsert).toBeDefined()
    const inserted = result.systemInsert ?? ''
    expect(inserted).toContain('[anvil_skills elided to fit budget]')
    expect(inserted).toContain('Keep this line')
    expect(inserted).toContain('Tail line')
    expect(inserted).not.toContain(big)
  })

  it('preserves systemInsert verbatim when total body already fits budget', async () => {
    const { execSync } = await import('node:child_process')
    const cleanEnv = { ...process.env }
    for (const key of Object.keys(cleanEnv)) {
      if (key.startsWith('GIT_')) delete cleanEnv[key]
    }
    execSync('git init -b main', {
      cwd: tmpDir,
      env: cleanEnv,
      stdio: 'ignore',
    })

    const notepadsDir = join(tmpDir, '.anvil', 'notepads', 'main')
    await mkdir(notepadsDir, { recursive: true })
    const small = '<anvil_skills>tiny</anvil_skills>\nbody'
    await writeFile(join(notepadsDir, 'recent-context.md'), small, 'utf-8')

    const result = await sessionStartHandler(makeCtx(tmpDir))
    expect(result.exitCode).toBe(0)
    expect(result.systemInsert).toBeDefined()
    // Section preserved when no compaction needed.
    expect(result.systemInsert).toContain('<anvil_skills>')
    expect(result.systemInsert).not.toContain('elided to fit budget')
  })
})

// J4: HookResult shape contract
describe('hooks/handlers/session-start — HookResult shape (J4)', () => {
  it('passes HookResult.parse() for success path', async () => {
    const r = await withFixtureCopy(async (tmp) => {
      const ctx = {
        kind: 'session-start' as const,
        cwd: tmp,
        config: buildDefaultConfig(),
        env: {},
        payload: null,
      }
      return sessionStartHandler(ctx)
    })
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('passes HookResult.parse() for error/fallback path', async () => {
    const ctx = {
      kind: 'session-start' as const,
      cwd: '/nonexistent/path/that/does/not/exist',
      config: buildDefaultConfig(),
      env: {},
      payload: null,
    }
    const r = await sessionStartHandler(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })
})
