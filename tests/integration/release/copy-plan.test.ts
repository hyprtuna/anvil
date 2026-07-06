import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { releaseCommand } from '../../../scripts/dev/release.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

/**
 * Integration tests for ANV-0177 — `anvil release <version>` auto-copies
 * `.anvil/plans/v<version>.plan.md` → `docs/anvil/releases/v<version>.md`
 * as part of the ceremony, aligning runtime with the canonical lifecycle.
 */

interface FixtureOpts {
  fromVersion: string
  toVersion: string
  /** Create the plan file (default true). */
  withPlan?: boolean
  /** Create the released-slate file (default false — copy-needed path). */
  withSlate?: boolean
  /** Custom plan body (default: planned status). */
  planBody?: string
  /** Custom slate body (default: same as plan body). */
  slateBody?: string
}

function makeFixtureRepo(opts: FixtureOpts): string {
  const root = createTestTmpDir('release-copy-plan')
  const { fromVersion, toVersion } = opts
  const withPlan = opts.withPlan ?? true
  const withSlate = opts.withSlate ?? false

  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ name: 'anvil', version: fromVersion }, null, 2)}\n`,
    'utf-8',
  )
  writeFileSync(
    join(root, 'marketplace.json'),
    `${JSON.stringify({ name: 'anvil', version: fromVersion }, null, 2)}\n`,
    'utf-8',
  )
  writeFileSync(
    join(root, 'CHANGELOG.md'),
    `# Changelog\n\n## [${fromVersion}] — 2026-01-01\n\n- Prior release.\n`,
    'utf-8',
  )

  const planBody =
    opts.planBody ??
    `# v${toVersion}\n\nStatus: planned\n\n## Slate\n\n### Added\n\n- Plan-sourced item.\n\n### Fixed\n\n- Plan fix.\n`

  if (withPlan) {
    const plansDir = join(root, '.anvil', 'plans')
    mkdirSync(plansDir, { recursive: true })
    writeFileSync(join(plansDir, `v${toVersion}.plan.md`), planBody, 'utf-8')
  }

  if (withSlate) {
    const releasesDir = join(root, 'docs', 'anvil', 'releases')
    mkdirSync(releasesDir, { recursive: true })
    writeFileSync(
      join(releasesDir, `v${toVersion}.md`),
      opts.slateBody ?? planBody,
      'utf-8',
    )
  }

  const releaseTestDir = join(root, 'tests', 'unit', 'release')
  mkdirSync(releaseTestDir, { recursive: true })
  writeFileSync(
    join(releaseTestDir, `version-bump-v${fromVersion}.test.ts`),
    `// version-bump test for v${fromVersion}\n`,
    'utf-8',
  )

  return root
}

interface StreamCapture {
  readonly stdout: string
  readonly stderr: string
}

/**
 * Capture stdout + stderr writes during `fn`. Streams remain accessible after
 * `fn` resolves OR throws (e.g. when a process.exit stub re-throws).
 */
async function runWithCapture(fn: () => Promise<void>): Promise<StreamCapture> {
  const out: string[] = []
  const err: string[] = []
  const origOut = process.stdout.write.bind(process.stdout)
  const origErr = process.stderr.write.bind(process.stderr)
  process.stdout.write = (chunk: unknown): boolean => {
    out.push(typeof chunk === 'string' ? chunk : String(chunk))
    return true
  }
  process.stderr.write = (chunk: unknown): boolean => {
    err.push(typeof chunk === 'string' ? chunk : String(chunk))
    return true
  }
  try {
    await fn()
  } catch {
    // swallow — caller inspects exit code + captured streams
  } finally {
    process.stdout.write = origOut
    process.stderr.write = origErr
  }
  return { stdout: out.join(''), stderr: err.join('') }
}

interface ExitCapture {
  readonly code: number | undefined
  restore: () => void
}

function interceptExit(): ExitCapture {
  const state: { code: number | undefined } = { code: undefined }
  const origExit = process.exit.bind(process)
  // biome-ignore lint/suspicious/noExplicitAny: capturing exit code in test
  ;(process as any).exit = (code: number) => {
    state.code = code
    throw new Error(`process.exit(${code})`)
  }
  return {
    get code() {
      return state.code
    },
    restore: () => {
      process.exit = origExit
    },
  }
}

describe('anvil release — copy plan to released slate', () => {
  it('dry-run with only a plan file (no slate yet) shows the copy step plus 4 ceremony steps', async () => {
    const root = makeFixtureRepo({
      fromVersion: '0.13.3',
      toVersion: '0.99.0',
      withPlan: true,
      withSlate: false,
    })

    const { stdout } = await runWithCapture(async () => {
      await releaseCommand(
        '0.99.0',
        { dryRun: true, json: true, allowDirty: true },
        root,
      )
    })

    const plan = JSON.parse(stdout) as {
      steps: Array<{ step: number; action: string; status: string }>
    }

    expect(plan.steps).toHaveLength(5)
    expect(plan.steps[0]?.action).toContain('copy')
    expect(plan.steps[0]?.status).toBe('pending')
    expect(plan.steps[1]?.action).toContain('bump')
    expect(plan.steps[2]?.action).toContain('rewrite')
    expect(plan.steps[3]?.action).toContain('flip')
    expect(plan.steps[4]?.action).toContain('prepend')

    // Dry-run must NOT actually create the slate.
    expect(
      existsSync(join(root, 'docs', 'anvil', 'releases', 'v0.99.0.md')),
    ).toBe(false)

    rmSync(root, { recursive: true })
  })

  it('non-dry-run performs the copy plus 4 ceremony steps atomically', async () => {
    const root = makeFixtureRepo({
      fromVersion: '0.13.3',
      toVersion: '0.99.0',
      withPlan: true,
      withSlate: false,
    })
    const exit = interceptExit()

    let captured: StreamCapture = { stdout: '', stderr: '' }
    try {
      captured = await runWithCapture(async () => {
        await releaseCommand('0.99.0', { json: true, allowDirty: true }, root)
      })
    } finally {
      exit.restore()
    }

    expect(exit.code, `stderr: ${captured.stderr}`).toBe(0)

    const slatePath = join(root, 'docs', 'anvil', 'releases', 'v0.99.0.md')
    expect(existsSync(slatePath)).toBe(true)
    expect(existsSync(join(root, '.anvil', 'plans', 'v0.99.0.plan.md'))).toBe(
      true,
    )

    const slateBody = readFileSync(slatePath, 'utf-8')
    expect(slateBody).toMatch(/^Status:\s*released\s+\d{4}-\d{2}-\d{2}$/m)

    rmSync(root, { recursive: true })
  })

  it('skips the copy with an info message when the slate already exists', async () => {
    const customSlate =
      '# v0.99.0\n\nStatus: planned\n\n## Slate\n\n### Added\n\n- Hand-edited slate item.\n'
    const root = makeFixtureRepo({
      fromVersion: '0.13.3',
      toVersion: '0.99.0',
      withPlan: true,
      withSlate: true,
      slateBody: customSlate,
    })

    const { stdout } = await runWithCapture(async () => {
      await releaseCommand(
        '0.99.0',
        { dryRun: true, json: true, allowDirty: true },
        root,
      )
    })

    const plan = JSON.parse(stdout) as {
      steps: Array<{
        step: number
        action: string
        status: string
        target: string
      }>
    }

    expect(plan.steps[0]?.action).toContain('copy')
    expect(plan.steps[0]?.status).toBe('skipped')
    expect(plan.steps[0]?.target).toContain('--force-copy')

    rmSync(root, { recursive: true })
  })

  it('--force-copy overwrites the existing slate from the plan', async () => {
    const planBody =
      '# v0.99.0\n\nStatus: planned\n\n## Slate\n\n### Added\n\n- Plan-sourced item (canonical).\n'
    const slateBody =
      '# v0.99.0\n\nStatus: planned\n\n## Slate\n\n### Added\n\n- Stale hand-edited slate item.\n'
    const root = makeFixtureRepo({
      fromVersion: '0.13.3',
      toVersion: '0.99.0',
      withPlan: true,
      withSlate: true,
      planBody,
      slateBody,
    })
    const exit = interceptExit()

    try {
      await runWithCapture(async () => {
        await releaseCommand(
          '0.99.0',
          { json: true, allowDirty: true, forceCopy: true },
          root,
        )
      })
    } finally {
      exit.restore()
    }

    expect(exit.code).toBe(0)

    const slateAfter = readFileSync(
      join(root, 'docs', 'anvil', 'releases', 'v0.99.0.md'),
      'utf-8',
    )
    expect(slateAfter).toContain('Plan-sourced item (canonical)')
    expect(slateAfter).not.toContain('Stale hand-edited slate item')
    expect(slateAfter).toMatch(/^Status:\s*released\s+\d{4}-\d{2}-\d{2}$/m)

    rmSync(root, { recursive: true })
  })

  it('aborts with a clear error when the plan file is missing', async () => {
    const root = makeFixtureRepo({
      fromVersion: '0.13.3',
      toVersion: '0.99.0',
      withPlan: false,
      withSlate: false,
    })
    const exit = interceptExit()

    let captured: StreamCapture
    try {
      captured = await runWithCapture(async () => {
        await releaseCommand('0.99.0', { dryRun: true, allowDirty: true }, root)
      })
    } finally {
      exit.restore()
    }

    expect(exit.code).toBe(1)
    expect(captured.stderr).toContain(
      'plan file not found at .anvil/plans/v0.99.0.plan.md',
    )

    rmSync(root, { recursive: true })
  })
})
