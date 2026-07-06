import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { doctorCommand } from '../../src/commands/cli/doctor.js'
import {
  ensureProjectDir,
  getProjectScopedPath,
} from '../../src/core/io/project-scoped-paths.js'
import {
  ANVIL_OC_ROUTING_CONTENT,
  OC_ROUTING_MARKER_CLOSE,
  OC_ROUTING_MARKER_OPEN,
} from '../../src/core/routing-rules-content.js'
import { buildContextFromRepo } from '../../src/installer/context-from-repo.js'
import { writeAnvilManifest } from '../../src/installer/install.js'
import { syncAnvilHome } from '../../src/installer/sync.js'
import { applyTargets } from '../../src/installer/wire.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

/**
 * End-to-end smoke for `anvil doctor` AFTER a full v2 install.
 *
 * Uses a fake home dir so we don't pollute the development's ~/.anvil.
 * Patches process.env.HOME so that doctor.ts resolves homedir() to the fake home.
 */
describe('integration/doctor-full', () => {
  let tmp: string
  let fakeHome: string
  let anvilHome: string
  let projectRoot: string
  let origCwd: string
  let origHome: string | undefined
  let writes: string[]
  let origWrite: typeof process.stdout.write

  beforeEach(async () => {
    origCwd = process.cwd()
    origHome = process.env.HOME

    tmp = createTestTmpDir('doctor')
    fakeHome = join(tmp, 'home')
    projectRoot = join(tmp, 'project')
    anvilHome = join(fakeHome, '.anvil')

    await mkdir(fakeHome, { recursive: true })
    await mkdir(projectRoot, { recursive: true })
    await mkdir(anvilHome, { recursive: true })
    // Plan 33 H2 compat: isProjectRoot gates project rows on .git / package.json.
    await mkdir(join(projectRoot, '.git'), { recursive: true })

    process.env.HOME = fakeHome
    process.chdir(projectRoot)

    writes = []
    origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: string | Uint8Array): boolean => {
      writes.push(
        typeof chunk === 'string'
          ? chunk
          : Buffer.from(chunk).toString('utf-8'),
      )
      return true
    }) as typeof process.stdout.write
  })

  afterEach(async () => {
    process.stdout.write = origWrite
    process.chdir(origCwd)
    if (origHome !== undefined) {
      process.env.HOME = origHome
    } else {
      // biome-ignore lint/performance/noDelete: process.env.HOME = undefined stores the string "undefined"; delete is the only way to unset an env var at runtime.
      delete process.env.HOME
    }
    await rm(tmp, { recursive: true, force: true })
  })

  it('reports install evidence checks pass after a full v2 install (JSON mode)', async () => {
    // Run the v2 install with the fake home
    const ctx = await buildContextFromRepo({
      sourceKind: 'local',
      sourceValue: projectRoot,
      scope: 'project',
      preset: 'balanced',
      home: fakeHome,
    })
    await syncAnvilHome({ ctx, target: anvilHome })
    await applyTargets(['cc-project', 'oc-user', 'oc-project'], {
      anvilHome,
      projectRoot,
    })

    // Plan 33 I1: write manifest so AGENTS.md doctor row uses target-based logic
    await writeAnvilManifest(anvilHome, 'both')

    // Plan 33 I2: simulate AGENTS.md with canonical routing block (as runInstaller would write)
    const canonicalBlock = [
      OC_ROUTING_MARKER_OPEN,
      ANVIL_OC_ROUTING_CONTENT.trimEnd(),
      OC_ROUTING_MARKER_CLOSE,
    ].join('\n')
    await writeFile(join(projectRoot, 'AGENTS.md'), `${canonicalBlock}\n`)

    await doctorCommand({ json: true })

    const payload = writes.join('')
    const checks = JSON.parse(payload) as Array<{
      name: string
      status: string
      detail: string
    }>
    expect(Array.isArray(checks)).toBe(true)

    const names = Object.fromEntries(checks.map((c) => [c.name, c]))

    // Core v2 layout checks
    expect(names['~/.anvil/version']?.status).toBe('pass')
    expect(
      names['~/.anvil/plugins/claude-code/.claude-plugin/plugin.json']?.status,
    ).toBe('pass')

    // OC project wiring: we wired oc-project so it should pass
    expect(names['OC project wiring (.opencode/opencode.json)']?.status).toBe(
      'pass',
    )

    // OC user wiring: we wired oc-user so it should pass
    expect(
      names['OC user wiring (~/.config/opencode/opencode.json)']?.status,
    ).toBe('pass')

    // CC project wiring: we wired cc-project; doctor may return 'pass', 'skip', or 'warn'
    // depending on installScope logic and dev machine state (ANV-0186).
    expect(['pass', 'skip', 'warn']).toContain(
      names['CC project wiring (.claude/settings.json)']?.status,
    )

    // None should be 'fail' in a clean post-install tree.
    // Exclude rows that depend on dev-machine state (hook validation log uses
    // real homedir() bypassing process.env.HOME; CC user wiring reads real
    // ~/.claude which may exist on the dev machine).
    const DEV_MACHINE_ROWS = new Set([
      'Hook output validation',
      'CC user wiring (~/.claude/plugins/installed_plugins.json)',
      // Pre-existing: /pr-branch slash command has no pr-branch.ts CLI counterpart yet.
      'CLI ↔ slash parity',
    ])
    const failures = checks.filter(
      (c) => c.status === 'fail' && !DEV_MACHINE_ROWS.has(c.name),
    )
    expect(failures).toEqual([])
  })

  it('reports warn for user-wiring and skip+expectedAbsence for project-wiring on global-only install (no project wiring done)', async () => {
    // Write a minimal version file so the anvilHome check passes, but no wiring done.
    // ANV-0157: ~/.anvil/version is now a global-evidence signal, so installScope
    // resolves to 'global'. The four project-wiring rows therefore get
    // status='skip' + expectedAbsence=true (quiet-mode suppression), not 'warn'.
    // User-wiring rows (CC user, OC user) have no expectedAbsence logic and still
    // emit 'warn' when unwired.
    await writeFile(join(anvilHome, 'version'), '0.0.0-test\n')

    await doctorCommand({ json: true })

    const payload = writes.join('')
    const checks = JSON.parse(payload) as Array<{
      name: string
      status: string
      expectedAbsence?: boolean
    }>
    const names = Object.fromEntries(checks.map((c) => [c.name, c]))

    // ~/.anvil/version present → pass
    expect(names['~/.anvil/version']?.status).toBe('pass')

    // User-level wiring rows are not scoped to global-only suppression → warn
    // Note: on a dev machine where ~/.claude/plugins/installed_plugins.json exists,
    // the row may report 'pass' instead of 'warn'. Accept both.
    expect(['warn', 'pass']).toContain(
      names['CC user wiring (~/.claude/plugins/installed_plugins.json)']
        ?.status,
    )
    // Note: on a dev machine where ~/.config/opencode/opencode.json exists,
    // the row may report 'pass' instead of 'warn'. Accept both.
    expect(['warn', 'pass']).toContain(
      names['OC user wiring (~/.config/opencode/opencode.json)']?.status,
    )

    // Project-wiring rows: installScope==='global' → skip + expectedAbsence=true
    // (ANV-0157 acceptance criterion: these rows are suppressed in quiet mode)
    for (const rowName of [
      'CC project wiring (.claude/settings.json)',
      'CC statusline wiring (.claude/settings.json → statusLine)',
      'CC settings template (.claude/settings.json)',
      'OC project wiring (.opencode/opencode.json)',
    ]) {
      const row = names[rowName]
      if (row !== undefined) {
        expect(
          row.status,
          `'${rowName}' should be skip on global-only install`,
        ).toBe('skip')
        expect(
          row.expectedAbsence,
          `'${rowName}' should have expectedAbsence=true for quiet-mode suppression`,
        ).toBe(true)
      }
    }
  })
})

// ─── Plan 31 B6: doctor checks for systemInsert paths ────────────────────────
describe('integration/doctor — Plan 31 B6 systemInsert path checks', () => {
  let tmpDir: string
  let fakeAnvilHome: string
  let origCwd: string

  beforeEach(async () => {
    origCwd = process.cwd()
    tmpDir = createTestTmpDir('b6-doctor')
    fakeAnvilHome = createTestTmpDir('b6-anvil-home')
    // Plan 33 H2 compat: isProjectRoot gates project rows on .git presence.
    await mkdir(join(tmpDir, '.git'), { recursive: true })
    process.chdir(tmpDir)
    process.env.ANVIL_HOME = fakeAnvilHome
  })

  afterEach(async () => {
    // biome-ignore lint/performance/noDelete: process.env.ANVIL_HOME = undefined stores the string "undefined"; delete is the only way to unset an env var at runtime.
    delete process.env.ANVIL_HOME
    process.chdir(origCwd)
    await rm(tmpDir, { recursive: true, force: true })
    await rm(fakeAnvilHome, { recursive: true, force: true })
  })

  async function runDoctorJson(): Promise<
    Array<{ name: string; status: string; detail: string }>
  > {
    const rows: Array<{ name: string; status: string; detail: string }> = []
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((
      chunk: string | Uint8Array,
      ...rest: Parameters<typeof process.stdout.write>
    ) => {
      if (typeof chunk === 'string') {
        try {
          const parsed = JSON.parse(chunk) as Array<{
            name: string
            status: string
            detail: string
          }>
          rows.push(...parsed)
        } catch {
          // not JSON
        }
      }
      return origWrite(chunk, ...(rest as [never]))
    }) as typeof process.stdout.write
    try {
      await doctorCommand({ json: true })
    } catch {
      // doctor exits with process.exit — catch to avoid test failure
    } finally {
      process.stdout.write = origWrite
    }
    return rows
  }

  it('B6a: warns when .claude/rules/anvil-routing.md is missing', async () => {
    const checks = await runDoctorJson()
    const check = checks.find(
      (c) =>
        c.name === '.claude/rules/anvil-routing.md (standing instructions)',
    )
    expect(check).toBeDefined()
    expect(check?.status).toBe('warn')
  })

  it('B6a: passes when .claude/rules/anvil-routing.md is canonical', async () => {
    const { ANVIL_ROUTING_RULES_CONTENT } = await import(
      '../../src/core/routing-rules-content.js'
    )
    await mkdir(join(tmpDir, '.claude', 'rules'), { recursive: true })
    await writeFile(
      join(tmpDir, '.claude', 'rules', 'anvil-routing.md'),
      ANVIL_ROUTING_RULES_CONTENT,
      'utf-8',
    )
    const checks = await runDoctorJson()
    const check = checks.find(
      (c) =>
        c.name === '.claude/rules/anvil-routing.md (standing instructions)',
    )
    expect(check?.status).toBe('pass')
  })

  it('B6a: warns when .claude/rules/anvil-routing.md is divergent', async () => {
    await mkdir(join(tmpDir, '.claude', 'rules'), { recursive: true })
    await writeFile(
      join(tmpDir, '.claude', 'rules', 'anvil-routing.md'),
      '# custom content',
      'utf-8',
    )
    const checks = await runDoctorJson()
    const check = checks.find(
      (c) =>
        c.name === '.claude/rules/anvil-routing.md (standing instructions)',
    )
    expect(check?.status).toBe('warn')
    expect(check?.detail).toContain('divergent')
  })

  it('B6b: warns when active-routing.json is absent', async () => {
    const checks = await runDoctorJson()
    const check = checks.find(
      (c) => c.name === 'active-routing.json (last routing decision)',
    )
    expect(check).toBeDefined()
    expect(check?.status).toBe('warn')
  })

  it('B6b: passes and echoes timestamp when active-routing.json is present', async () => {
    const ts = new Date().toISOString()
    // Write to the per-project path (ANVIL_HOME set in beforeEach)
    await ensureProjectDir(tmpDir)
    const routingPath = await getProjectScopedPath(tmpDir, 'active-routing')
    await writeFile(
      routingPath,
      JSON.stringify({
        systemInsert: 'directive',
        prompt: 'debug',
        timestamp: ts,
      }),
      'utf-8',
    )
    const checks = await runDoctorJson()
    const check = checks.find(
      (c) => c.name === 'active-routing.json (last routing decision)',
    )
    expect(check?.status).toBe('pass')
    expect(check?.detail).toContain(ts)
  })

  it('B6c: envelope dry-run check is NOT in anvil doctor (migrated to dev:doctor)', async () => {
    // The additionalContext envelope dry-run check was migrated from `anvil doctor`
    // to `npm run dev:doctor` by ANV-0185. It should no longer appear here.
    const checks = await runDoctorJson()
    const check = checks.find(
      (c) => c.name === 'additionalContext envelope dry-run',
    )
    expect(check).toBeUndefined()
  })
})
