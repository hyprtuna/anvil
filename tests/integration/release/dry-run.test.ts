import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { releaseCommand } from '../../../scripts/dev/release.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

/**
 * Integration test for `anvil release <version> --dry-run`.
 *
 * Tests run against a tmpdir-scaffolded fixture repo that mirrors the minimum
 * required structure: package.json, marketplace.json, a slate doc, and a
 * previous version-bump test file.
 *
 * Idempotency: --dry-run MUST produce byte-identical output for the same
 * (from, to) pair regardless of how many times it is run (no writes happen).
 */

function makeFixtureRepo(fromVersion: string, toVersion: string): string {
  const root = createTestTmpDir('release-fixture')

  // package.json
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ name: 'anvil', version: fromVersion }, null, 2)}\n`,
    'utf-8',
  )

  // marketplace.json
  writeFileSync(
    join(root, 'marketplace.json'),
    `${JSON.stringify({ name: 'anvil', version: fromVersion }, null, 2)}\n`,
    'utf-8',
  )

  // Release slate (with "Status: planned")
  const releasesDir = join(root, 'docs', 'anvil', 'releases')
  mkdirSync(releasesDir, { recursive: true })
  writeFileSync(
    join(releasesDir, `v${toVersion}.md`),
    `# v${toVersion}\n\nStatus: planned\n\n## Slate\n\n### Added\n\n- Fixture item.\n\n### Fixed\n\n- Fixture fix.\n`,
    'utf-8',
  )

  // In-flight plan (canonical source per ANV-0177 / ANV-0174 lifecycle).
  // The release command requires `.anvil/plans/v<to>.plan.md` to exist.
  const plansDir = join(root, '.anvil', 'plans')
  mkdirSync(plansDir, { recursive: true })
  writeFileSync(
    join(plansDir, `v${toVersion}.plan.md`),
    `# v${toVersion}\n\nStatus: planned\n\n## Slate\n\n### Added\n\n- Fixture item.\n\n### Fixed\n\n- Fixture fix.\n`,
    'utf-8',
  )

  // Previous version-bump test file
  const releaseTestDir = join(root, 'tests', 'unit', 'release')
  mkdirSync(releaseTestDir, { recursive: true })
  writeFileSync(
    join(releaseTestDir, `version-bump-v${fromVersion}.test.ts`),
    `// version-bump test for v${fromVersion}\n`,
    'utf-8',
  )

  return root
}

/**
 * Capture stdout written during fn(), return as string.
 */
async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = []
  const origWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk: unknown): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : String(chunk))
    return true
  }
  try {
    await fn()
  } finally {
    process.stdout.write = origWrite
  }
  return chunks.join('')
}

/**
 * Intercept process.exit, capture the code, re-throw so the caller can
 * catch the stub error and resume.
 */
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

describe('anvil release --dry-run integration', () => {
  it('emits a valid ReleasePlan JSON for a fixture repo', async () => {
    const root = makeFixtureRepo('0.13.3', '0.99.0')

    const output = await captureStdout(async () => {
      await releaseCommand(
        '0.99.0',
        { dryRun: true, json: true, allowDirty: true },
        root,
      )
    })

    const plan = JSON.parse(output) as {
      from: string
      to: string
      dryRun: boolean
      steps: Array<{ step: number; action: string; status: string }>
      gitSuggestion: { commitMessage: string; tagName: string }
    }

    expect(plan.from).toBe('0.13.3')
    expect(plan.to).toBe('0.99.0')
    expect(plan.dryRun).toBe(true)
    // 5 steps post-ANV-0177: copy + 4 ceremony steps.
    expect(plan.steps).toHaveLength(5)
    expect(plan.gitSuggestion.commitMessage).toBe('chore(release): v0.99.0')
    expect(plan.gitSuggestion.tagName).toBe('v0.99.0')
    // The copy step is 'skipped' here because the fixture also creates the
    // slate (back-compat with pre-ANV-0177 fixture state). Slate-present-and-
    // copy-skipped is a supported path. Other steps are 'pending'.
    expect(plan.steps[0]?.status).toBe('skipped')
    for (const step of plan.steps.slice(1)) {
      expect(step.status).toBe('pending')
    }

    rmSync(root, { recursive: true })
  })

  it('step actions describe the 4 ceremony operations', async () => {
    const root = makeFixtureRepo('0.13.3', '0.99.0')

    const output = await captureStdout(async () => {
      await releaseCommand(
        '0.99.0',
        { dryRun: true, json: true, allowDirty: true },
        root,
      )
    })

    const plan = JSON.parse(output) as {
      steps: Array<{ step: number; action: string }>
    }

    // Post-ANV-0177: step 0 is the copy step, then the original 4 ceremony
    // operations occupy positions 1–4.
    expect(plan.steps[0]?.action).toContain('copy')
    expect(plan.steps[1]?.action).toContain('bump')
    expect(plan.steps[2]?.action).toContain('rewrite')
    expect(plan.steps[3]?.action).toContain('flip')
    expect(plan.steps[4]?.action).toContain('prepend')

    rmSync(root, { recursive: true })
  })

  it('--dry-run is idempotent: same JSON output on repeated calls', async () => {
    const root = makeFixtureRepo('0.13.3', '0.99.1')

    const first = await captureStdout(async () => {
      await releaseCommand(
        '0.99.1',
        { dryRun: true, json: true, allowDirty: true },
        root,
      )
    })
    const second = await captureStdout(async () => {
      await releaseCommand(
        '0.99.1',
        { dryRun: true, json: true, allowDirty: true },
        root,
      )
    })

    // Parse both to compare semantically (handles whitespace differences).
    expect(JSON.parse(first)).toEqual(JSON.parse(second))

    rmSync(root, { recursive: true })
  })

  it('--dry-run does NOT write any files to disk', async () => {
    const root = makeFixtureRepo('0.13.3', '0.99.2')

    await captureStdout(async () => {
      await releaseCommand(
        '0.99.2',
        { dryRun: true, json: true, allowDirty: true },
        root,
      )
    })

    // package.json and marketplace.json must still have the original version.
    const pkg = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf-8'),
    ) as { version: string }
    const mkt = JSON.parse(
      readFileSync(join(root, 'marketplace.json'), 'utf-8'),
    ) as { version: string }
    expect(pkg.version).toBe('0.13.3')
    expect(mkt.version).toBe('0.13.3')

    rmSync(root, { recursive: true })
  })

  it('exits 1 when to version is not strictly greater than from', async () => {
    const root = makeFixtureRepo('0.13.3', '0.99.3')
    const exit = interceptExit()

    try {
      await releaseCommand(
        '0.13.2', // less than current 0.13.3
        { dryRun: true, allowDirty: true },
        root,
      )
    } catch {
      // expected: process.exit stub throws
    } finally {
      exit.restore()
    }

    expect(exit.code).toBe(1)
    rmSync(root, { recursive: true })
  })

  it('exits 1 when plan file does not exist for the target version', async () => {
    const root = makeFixtureRepo('0.13.3', '0.99.3')
    // The fixture creates a plan + slate for 0.99.3, but we release to
    // 0.99.9 (no plan, no slate). Per ANV-0177 the abort now points at the
    // plan path (the canonical source).
    const exit = interceptExit()

    try {
      await releaseCommand('0.99.9', { dryRun: true, allowDirty: true }, root)
    } catch {
      // expected: process.exit stub throws
    } finally {
      exit.restore()
    }

    expect(exit.code).toBe(1)
    rmSync(root, { recursive: true })
  })
})
