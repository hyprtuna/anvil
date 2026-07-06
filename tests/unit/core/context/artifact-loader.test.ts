import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ARTIFACT_BUDGETS,
  SESSION_ARTIFACT_BUDGET_CHARS,
  buildPhaseManifest,
  loadArtifacts,
  loadPhaseContext,
  renderArtifactBlock,
} from '../../../../src/core/context/artifact-loader.js'

// ─── helpers ──────────────────────────────────────────────────────────────────

function tmpDir(): string {
  const dir = join(
    tmpdir(),
    `artifact-loader-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

function writeArtifact(dir: string, relPath: string, content: string): void {
  const abs = join(dir, relPath)
  mkdirSync(abs.replace(/\/[^/]+$/, ''), { recursive: true })
  writeFileSync(abs, content, 'utf-8')
}

// ─── constants ────────────────────────────────────────────────────────────────

describe('SESSION_ARTIFACT_BUDGET_CHARS', () => {
  it('defaults to 6 KB', () => {
    expect(SESSION_ARTIFACT_BUDGET_CHARS).toBe(6 * 1024)
  })
})

describe('ARTIFACT_BUDGETS', () => {
  it('defines budgets for all artifact kinds', () => {
    const kinds = ['spec', 'plan', 'tasks', 'release-slate', 'notepad'] as const
    for (const kind of kinds) {
      expect(ARTIFACT_BUDGETS[kind]).toBeGreaterThan(0)
    }
  })
})

// ─── buildPhaseManifest ───────────────────────────────────────────────────────

describe('buildPhaseManifest', () => {
  it('returns empty manifest for phase=none', () => {
    const manifest = buildPhaseManifest('/tmp/x', 'none', undefined)
    expect(manifest).toHaveLength(0)
  })

  it('returns empty manifest for phase=research', () => {
    const manifest = buildPhaseManifest('/tmp/x', 'research', undefined)
    expect(manifest).toHaveLength(0)
  })

  it('returns spec + release-slate for phase=spec', () => {
    const manifest = buildPhaseManifest('/tmp/x', 'spec', 'my-feature')
    expect(manifest.some((e) => e.kind === 'spec')).toBe(true)
    expect(manifest.find((e) => e.kind === 'spec')?.required).toBe(true)
  })

  it('returns plan + tasks + spec for phase=implement', () => {
    const manifest = buildPhaseManifest('/tmp/x', 'implement', 'my-feature')
    const kinds = manifest.map((e) => e.kind)
    expect(kinds).toContain('plan')
    expect(manifest.find((e) => e.kind === 'plan')?.required).toBe(true)
  })

  it('returns spec + plan for phase=plan (both required)', () => {
    const manifest = buildPhaseManifest('/tmp/x', 'plan', 'my-feature')
    expect(manifest.find((e) => e.kind === 'spec')?.required).toBe(true)
    expect(manifest.find((e) => e.kind === 'plan')?.required).toBe(true)
  })
})

// ─── loadArtifacts ────────────────────────────────────────────────────────────

describe('loadArtifacts', () => {
  let cwd: string

  beforeEach(() => {
    cwd = tmpDir()
  })

  it('returns empty result for phase=none', async () => {
    const result = await loadArtifacts(cwd, 'none', undefined)
    expect(result.artifacts).toHaveLength(0)
    expect(result.totalChars).toBe(0)
    expect(result.budgetHit).toBe(false)
  })

  it('emits warning for missing required artifact (non-blocking)', async () => {
    const result = await loadArtifacts(cwd, 'plan', 'my-feature')
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings.some((w) => w.includes('missing required'))).toBe(
      true,
    )
    // Still returns — doesn't throw
    expect(result.artifacts.length).toBeGreaterThan(0)
  })

  it('loads artifact and respects per-artifact budget', async () => {
    // Write a large spec
    const specContent = `---\ntitle: Test Spec\n---\n# Spec\n\n${'body '.repeat(500)}`
    writeArtifact(cwd, '.anvil/specs/features/my-feat/spec.md', specContent)

    const result = await loadArtifacts(cwd, 'spec', 'my-feat', {
      perArtifactBudgets: { spec: 200 },
    })
    const specArtifact = result.artifacts.find((a) => a.kind === 'spec')
    expect(specArtifact).toBeDefined()
    expect(specArtifact?.missing).toBe(false)
    expect(specArtifact?.content).toBeDefined()
    // Content should be <= 200 chars plus notice overhead
    expect((specArtifact?.content ?? '').length).toBeLessThanOrEqual(500)
  })

  it('preserves frontmatter in truncated artifact', async () => {
    const specContent = `---\ntitle: My Spec\nstatus: draft\n---\n# Section\n\n${'x'.repeat(1000)}`
    writeArtifact(cwd, '.anvil/specs/features/slug/spec.md', specContent)

    const result = await loadArtifacts(cwd, 'spec', 'slug', {
      perArtifactBudgets: { spec: 150 },
    })
    const art = result.artifacts.find((a) => a.kind === 'spec')
    expect(art?.content).toContain('title: My Spec')
    expect(art?.content).toContain('status: draft')
  })

  it('preserves checklist items in truncated artifact', async () => {
    const planContent = `# Plan\n\n- [ ] Step one\n- [x] Step done\n- [ ] Step two\n\n${'Description '.repeat(200)}`
    writeArtifact(cwd, '.anvil/specs/features/slug/plan.md', planContent)

    const result = await loadArtifacts(cwd, 'implement', 'slug', {
      perArtifactBudgets: { plan: 100 },
    })
    const art = result.artifacts.find((a) => a.kind === 'plan')
    expect(art?.content).toContain('- [ ] Step')
  })

  it('enforces aggregate budget and sets budgetHit', async () => {
    // Write two large artifacts. The aggregate budget is set to only allow
    // the first artifact; after loading the plan, totalChars should exceed
    // the aggregate, causing the next iteration to set budgetHit.
    const planContent = `# Plan\n\n${'p'.repeat(2000)}`
    const specContent = `# Spec\n\n${'s'.repeat(2000)}`
    writeArtifact(cwd, '.anvil/specs/features/slug/plan.md', planContent)
    writeArtifact(cwd, '.anvil/specs/features/slug/spec.md', specContent)

    // Give tasks a file too so the second manifest entry isn't a "missing" skip
    writeArtifact(cwd, '.anvil/specs/features/slug/tasks.md', 't'.repeat(500))

    // Aggregate budget = 10 chars — any loaded artifact will exceed it on second pass.
    // Per-artifact budget = 1000 so truncation doesn't prevent loading.
    const result = await loadArtifacts(cwd, 'implement', 'slug', {
      aggregateBudgetChars: 10,
      perArtifactBudgets: {
        plan: 1000,
        spec: 1000,
        tasks: 1000,
        'release-slate': 1000,
        notepad: 1000,
      },
    })
    expect(result.budgetHit).toBe(true)
  })

  it('sets budgetHit when the final loaded artifact is the one that overflows', async () => {
    // Only one artifact in the manifest (spec phase has one required artifact: spec).
    // The spec content is large enough that after loading it, totalChars >= aggregateBudget.
    // The overflow-detection must fire on the same iteration, not the next loop check.
    const specContent = `# Spec\n\n${'s'.repeat(500)}`
    writeArtifact(
      cwd,
      '.anvil/specs/features/last-overflow/spec.md',
      specContent,
    )

    // aggregateBudget is 10 — spec content will exceed this after first (and only) load.
    const result = await loadArtifacts(cwd, 'spec', 'last-overflow', {
      aggregateBudgetChars: 10,
      perArtifactBudgets: {
        spec: 1000,
        plan: 1000,
        tasks: 1000,
        'release-slate': 1000,
        notepad: 1000,
      },
    })
    expect(result.budgetHit).toBe(true)
  })

  it('returns no warning for missing optional artifact', async () => {
    const result = await loadArtifacts(cwd, 'implement', 'slug')
    // In implement phase, only 'plan' is required. 'tasks' and 'spec' are optional.
    // Warnings should only reference required artifacts.
    const warnings = result.warnings.filter((w) =>
      w.includes('missing required'),
    )
    // Only the plan should generate a missing-required warning
    expect(warnings.every((w) => w.includes('(plan)'))).toBe(true)
  })
})

// ─── loadPhaseContext ─────────────────────────────────────────────────────────

describe('loadPhaseContext', () => {
  let cwd: string

  beforeEach(() => {
    cwd = tmpDir()
  })

  it('returns empty result for phase=none', async () => {
    const result = await loadPhaseContext({
      cwd,
      phase: 'none',
      featureSlug: undefined,
    })
    expect(result.artifacts).toHaveLength(0)
  })

  it('orders entries by priority (highest first)', async () => {
    const planContent = '# Plan\n\nPlan body content here.\n'
    const specContent = '# Spec\n\nSpec body content here.\n'
    const tasksContent = '# Tasks\n\nTasks body content here.\n'
    writeArtifact(cwd, '.anvil/specs/features/slug/plan.md', planContent)
    writeArtifact(cwd, '.anvil/specs/features/slug/spec.md', specContent)
    writeArtifact(cwd, '.anvil/specs/features/slug/tasks.md', tasksContent)

    const result = await loadPhaseContext({
      cwd,
      phase: 'implement',
      featureSlug: 'slug',
    })
    // In implement phase, plan has priority 100, tasks 80, spec 60.
    expect(result.artifacts[0]?.kind).toBe('plan')
  })

  it('respects per-entry maxBytes from the manifest', async () => {
    const huge = `# Spec\n\n${'body '.repeat(2000)}`
    writeArtifact(cwd, '.anvil/specs/features/slug/spec.md', huge)
    const result = await loadPhaseContext({
      cwd,
      phase: 'spec',
      featureSlug: 'slug',
    })
    const spec = result.artifacts.find((a) => a.kind === 'spec')
    expect(spec?.content).toBeDefined()
    expect(spec?.truncated).toBe(true)
    // Default spec maxBytes is 1024 from DEFAULT_PHASE_MANIFEST.
    expect((spec?.content ?? '').length).toBeLessThanOrEqual(1024)
  })

  it('emits a stderr JSON line when emitObservability is true and budget hit', async () => {
    const stderr: string[] = []
    const orig = process.stderr.write.bind(process.stderr)
    // @ts-expect-error — intercept for test
    process.stderr.write = (chunk: string | Uint8Array) => {
      stderr.push(
        typeof chunk === 'string'
          ? chunk
          : Buffer.from(chunk).toString('utf-8'),
      )
      return true
    }
    try {
      const huge = `# Spec\n\n${'s'.repeat(5000)}`
      writeArtifact(cwd, '.anvil/specs/features/slug/spec.md', huge)
      writeArtifact(cwd, '.anvil/specs/features/slug/plan.md', huge)
      await loadPhaseContext({
        cwd,
        phase: 'plan',
        featureSlug: 'slug',
        aggregateBudgetChars: 100,
        emitObservability: true,
      })
    } finally {
      process.stderr.write = orig
    }
    // Look for a JSON-ish line emitted by the loader.
    const lines = stderr.filter(
      (s) => s.trim().startsWith('{') && s.includes('"budgetChars"'),
    )
    expect(lines.length).toBeGreaterThan(0)
    const parsed = JSON.parse(lines[0]?.trim() ?? '{}') as Record<
      string,
      unknown
    >
    expect(parsed.budgetChars).toBe(100)
    expect(parsed.phase).toBe('plan')
  })
})

// ─── renderArtifactBlock ──────────────────────────────────────────────────────

describe('renderArtifactBlock', () => {
  it('returns undefined when no artifacts were loaded', () => {
    const result = {
      artifacts: [
        {
          kind: 'spec' as const,
          path: '/x',
          content: undefined,
          truncated: false,
          missing: true,
        },
      ],
      totalChars: 0,
      budgetHit: false,
      warnings: [],
    }
    expect(renderArtifactBlock(result, 'implement')).toBeUndefined()
  })

  it('renders loaded artifacts with header', () => {
    const result = {
      artifacts: [
        {
          kind: 'plan' as const,
          path: '/x/plan.md',
          content: '# My Plan',
          truncated: false,
          missing: false,
        },
      ],
      totalChars: 9,
      budgetHit: false,
      warnings: [],
    }
    const block = renderArtifactBlock(result, 'implement')
    expect(block).toContain('## Active artifacts [phase: implement')
    expect(block).toContain('### plan')
    expect(block).toContain('# My Plan')
  })

  it('includes budget notice when budgetHit is true', () => {
    const result = {
      artifacts: [
        {
          kind: 'plan' as const,
          path: '/x/plan.md',
          content: 'content',
          truncated: false,
          missing: false,
        },
      ],
      totalChars: 7,
      budgetHit: true,
      warnings: [],
    }
    const block = renderArtifactBlock(result, 'implement')
    expect(block).toContain('aggregate artifact budget reached')
  })
})
