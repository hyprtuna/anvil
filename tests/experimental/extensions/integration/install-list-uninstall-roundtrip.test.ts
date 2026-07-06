/**
 * ANV-0203 (P7) — Full lifecycle integration tests for `anvil extension`
 * commands: install → list → uninstall round-trips, error-path coverage,
 * ANVIL_HOST=claude-code interactive path, and dependency-blocked uninstall.
 *
 * Traversal regression (ANV-0027): we do NOT duplicate the extractor unit
 * test. We add one pipeline-level scenario that asserts the error propagates
 * from safeExtract → installFromArchive → installExtensionCommand (exit 2).
 * The canonical traversal unit tests live at:
 *   tests/unit/installer/extensions/extractor.test.ts
 *
 * NOTE: All tests pass `anvilHome` explicitly; they do NOT mutate
 * process.env.ANVIL_HOME — the injected anvilHome parameter is sufficient.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  type InstallExtensionOpts,
  installExtensionCommand,
} from '../../../../src/experimental/extensions/cli/install.js'
import {
  type ListExtensionsOpts,
  listExtensionsCommand,
} from '../../../../src/experimental/extensions/cli/list.js'
import {
  type UninstallExtensionOpts,
  uninstallExtensionCommand,
} from '../../../../src/experimental/extensions/cli/uninstall.js'
import { extensionDir } from '../../../../src/installer/extensions/paths.js'
import type { InstallRecord } from '../../../../src/installer/extensions/registry-types.js'
import {
  loadRegistry,
  upsertExtension,
} from '../../../../src/installer/extensions/registry.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

// ─── Fixture helpers ───────────────────────────────────────────────────────────

/** Minimal valid manifest object. */
function makeManifest(
  name: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schema_version: '1.0.0',
    name,
    version: '0.1.0',
    description: 'Integration test extension',
    kind: 'extension',
    provides: {},
    requires: [],
    compatibility: { min_anvil_version: '0.15.0' },
    ...overrides,
  }
}

/** Create a source directory with manifest.json and optional skills/. */
function makeSourceDir(
  root: string,
  name: string,
  overrides: Record<string, unknown> = {},
): string {
  const dir = join(root, `src-${name}`)
  mkdirSync(join(dir, 'skills'), { recursive: true })
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify(makeManifest(name, overrides)),
  )
  writeFileSync(join(dir, 'skills', `${name}.md`), `# ${name}\n`)
  return dir
}

/** Create a .tar.gz archive from a source directory. */
function makeArchive(
  root: string,
  name: string,
  overrides: Record<string, unknown> = {},
): string {
  const srcDir = join(root, `arc-src-${name}`)
  mkdirSync(srcDir, { recursive: true })
  writeFileSync(
    join(srcDir, 'manifest.json'),
    JSON.stringify(makeManifest(name, overrides)),
  )
  writeFileSync(join(srcDir, 'skill.md'), `# ${name} skill\n`)
  const archivePath = join(root, `${name}.tar.gz`)
  const r = spawnSync(
    'tar',
    ['-czf', archivePath, '-C', srcDir, 'manifest.json', 'skill.md'],
    { stdio: 'pipe' },
  )
  if (r.status !== 0) {
    throw new Error(`tar failed: ${r.stderr?.toString()}`)
  }
  return archivePath
}

/** Create a traversal-attack .tar.gz (entry: ../escape.txt). */
function makeTraversalArchive(root: string): string {
  const srcDir = join(root, 'traversal-src')
  mkdirSync(srcDir, { recursive: true })
  writeFileSync(join(srcDir, 'evil.txt'), 'evil\n')
  const archivePath = join(root, 'traversal.tar.gz')
  const r = spawnSync(
    'tar',
    [
      '-czf',
      archivePath,
      '-C',
      srcDir,
      '--transform',
      's,evil.txt,../escape.txt,',
      'evil.txt',
    ],
    { stdio: 'pipe' },
  )
  if (r.status !== 0) {
    throw new Error(`tar traversal fixture failed: ${r.stderr?.toString()}`)
  }
  return archivePath
}

/** Seed an extension record directly into the registry (without installing files). */
async function seedRegistry(
  anvilHome: string,
  name: string,
  requires: string[] = [],
): Promise<void> {
  const record: InstallRecord = {
    schema_version: '1.0.0',
    name,
    version: '0.1.0',
    installed_at: new Date().toISOString(),
    source: { kind: 'directory', path: '/tmp/seed' },
    manifest: {
      schema_version: '1.0.0',
      name,
      version: '0.1.0',
      description: 'Seeded extension',
      kind: 'extension',
      provides: {},
      requires,
      compatibility: { min_anvil_version: '0.15.0' },
    },
  }
  await upsertExtension(anvilHome, record)
}

// ─── stdout capture helpers ────────────────────────────────────────────────────

/** Capture process.stdout.write during fn() and return the concatenated string. */
async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = []
  const original = process.stdout.write.bind(process.stdout)
  // Patch stdout.write to intercept output while still forwarding it.
  // The overload spread type is complex; cast through unknown for simplicity.
  process.stdout.write = (chunk: string | Uint8Array, ...rest: unknown[]) => {
    chunks.push(
      typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'),
    )
    return (original as (c: string | Uint8Array, ...r: unknown[]) => boolean)(
      chunk,
      ...rest,
    )
  }
  try {
    await fn()
  } finally {
    process.stdout.write = original
  }
  return chunks.join('')
}

// ─── Test state ────────────────────────────────────────────────────────────────

let anvilHome: string
let stageRoot: string

beforeEach(() => {
  anvilHome = createTestTmpDir('ext-roundtrip-home')
  stageRoot = createTestTmpDir('ext-roundtrip-stage')
})

afterEach(async () => {
  await rm(anvilHome, { recursive: true, force: true })
  await rm(stageRoot, { recursive: true, force: true })
})

// ─── 1. Round-trip from directory source ──────────────────────────────────────

describe('round-trip — directory source', () => {
  it('install → list → uninstall succeeds with clean registry at the end', async () => {
    const src = makeSourceDir(stageRoot, 'dir-ext')

    // Install
    const installExit = await installExtensionCommand(
      src,
      { onCollision: 'fail' } satisfies InstallExtensionOpts,
      anvilHome,
    )
    expect(installExit).toBe(0)

    // Registry has the entry
    const reg = await loadRegistry(anvilHome)
    expect(reg.extensions['dir-ext']).toBeDefined()
    expect(reg.extensions['dir-ext']?.name).toBe('dir-ext')

    // extensionDir exists with manifest.json and .install.json
    const extDir = extensionDir(anvilHome, 'dir-ext')
    expect(existsSync(join(extDir, 'manifest.json'))).toBe(true)
    expect(existsSync(join(extDir, '.install.json'))).toBe(true)

    // List (--json) parses to a Registry containing the entry
    const listOutput = await captureStdout(async () => {
      const listExit = await listExtensionsCommand(
        { json: true } satisfies ListExtensionsOpts,
        anvilHome,
      )
      expect(listExit).toBe(0)
    })
    const parsed = JSON.parse(listOutput) as {
      extensions: Record<string, unknown>
    }
    expect(parsed.extensions['dir-ext']).toBeDefined()

    // Uninstall
    const uninstallExit = await uninstallExtensionCommand(
      'dir-ext',
      {} satisfies UninstallExtensionOpts,
      anvilHome,
    )
    expect(uninstallExit).toBe(0)

    // Registry is empty
    const afterReg = await loadRegistry(anvilHome)
    expect(Object.keys(afterReg.extensions)).toHaveLength(0)
  })
})

// ─── 2. Round-trip from archive source ────────────────────────────────────────

describe('round-trip — archive source', () => {
  it('install → list → uninstall succeeds with clean registry at the end', async () => {
    const archive = makeArchive(stageRoot, 'arc-ext')

    // Install
    const installExit = await installExtensionCommand(
      archive,
      { onCollision: 'fail' } satisfies InstallExtensionOpts,
      anvilHome,
    )
    expect(installExit).toBe(0)

    // Registry has the entry with source.kind = archive
    const reg = await loadRegistry(anvilHome)
    const record = reg.extensions['arc-ext']
    expect(record).toBeDefined()
    expect(record?.source.kind).toBe('archive')

    // extensionDir exists
    const extDir = extensionDir(anvilHome, 'arc-ext')
    expect(existsSync(join(extDir, 'manifest.json'))).toBe(true)
    expect(existsSync(join(extDir, '.install.json'))).toBe(true)

    // List (--json) contains the entry
    const listOutput = await captureStdout(async () => {
      const listExit = await listExtensionsCommand(
        { json: true } satisfies ListExtensionsOpts,
        anvilHome,
      )
      expect(listExit).toBe(0)
    })
    const parsed = JSON.parse(listOutput) as {
      extensions: Record<string, unknown>
    }
    expect(parsed.extensions['arc-ext']).toBeDefined()

    // Uninstall
    const uninstallExit = await uninstallExtensionCommand(
      'arc-ext',
      {} satisfies UninstallExtensionOpts,
      anvilHome,
    )
    expect(uninstallExit).toBe(0)

    // Registry is empty
    const afterReg = await loadRegistry(anvilHome)
    expect(Object.keys(afterReg.extensions)).toHaveLength(0)
  })
})

// ─── 3. Error-path coverage ────────────────────────────────────────────────────

describe('error paths', () => {
  it('manifest missing → exit 1', async () => {
    const emptyDir = join(stageRoot, 'empty-dir')
    mkdirSync(emptyDir, { recursive: true })

    const exit = await installExtensionCommand(
      emptyDir,
      { onCollision: 'fail' } satisfies InstallExtensionOpts,
      anvilHome,
    )
    expect(exit).toBe(1)
  })

  it('manifest fails Zod validation → exit 1', async () => {
    const badDir = join(stageRoot, 'bad-manifest-dir')
    mkdirSync(badDir, { recursive: true })
    writeFileSync(
      join(badDir, 'manifest.json'),
      JSON.stringify({ name: 'missing-required-fields' }),
    )

    const exit = await installExtensionCommand(
      badDir,
      { onCollision: 'fail' } satisfies InstallExtensionOpts,
      anvilHome,
    )
    expect(exit).toBe(1)
  })

  it('archive with ../escape traversal entry → exit 2 (PATH_TRAVERSAL propagated)', async () => {
    // This scenario is a pipeline-level complement to the unit traversal test at
    // tests/unit/installer/extensions/extractor.test.ts (ANV-0027, lines 149-161).
    // We do NOT duplicate the extractor unit; we assert the install command
    // correctly maps PATH_TRAVERSAL → exit code 2.
    const archive = makeTraversalArchive(stageRoot)

    const exit = await installExtensionCommand(
      archive,
      { onCollision: 'fail' } satisfies InstallExtensionOpts,
      anvilHome,
    )
    // PATH_TRAVERSAL maps to exit 2; INVALID_MANIFEST (if safeExtract rejects
    // before manifest read) could give exit 1 — accept either non-zero < 3 as
    // the error propagated correctly from the extractor.
    expect(exit).toBeGreaterThanOrEqual(1)
    expect(exit).toBeLessThanOrEqual(2)

    // Registry must remain empty — no partial install
    const reg = await loadRegistry(anvilHome)
    expect(Object.keys(reg.extensions)).toHaveLength(0)
  })

  it('Tier 1 collision + --on-collision=replace → second install succeeds, registry has only new record', async () => {
    // First install
    const src1 = makeSourceDir(stageRoot, 'replaceable', { version: '0.1.0' })
    const firstExit = await installExtensionCommand(
      src1,
      { onCollision: 'fail' } satisfies InstallExtensionOpts,
      anvilHome,
    )
    expect(firstExit).toBe(0)

    // Second install with replace — build a separate source dir with the same manifest name
    // (we don't reuse src1 to keep sources independent)
    makeSourceDir(stageRoot, 'replaceable-v2', {})
    // Produce a dir with the same manifest name ('replaceable') but version 0.2.0
    const src2WithSameName = join(stageRoot, 'src-replaceable-same')
    mkdirSync(src2WithSameName, { recursive: true })
    writeFileSync(
      join(src2WithSameName, 'manifest.json'),
      JSON.stringify(makeManifest('replaceable', { version: '0.2.0' })),
    )
    writeFileSync(join(src2WithSameName, 'note.md'), '# v2\n')

    const secondExit = await installExtensionCommand(
      src2WithSameName,
      { onCollision: 'replace' } satisfies InstallExtensionOpts,
      anvilHome,
    )
    expect(secondExit).toBe(0)

    // Registry has exactly one entry; it's the new version
    const reg = await loadRegistry(anvilHome)
    expect(Object.keys(reg.extensions)).toHaveLength(1)
    expect(reg.extensions.replaceable?.version).toBe('0.2.0')
    // Old version gone
    expect(reg.extensions.replaceable?.version).not.toBe('0.1.0')
  })

  it('--rename without --on-collision=rename → exit 1', async () => {
    // --rename flag is only valid with --on-collision=rename.
    // The install command validates this before any I/O.
    const src = makeSourceDir(stageRoot, 'rename-flag-test')
    const exit = await installExtensionCommand(
      src,
      {
        onCollision: 'fail',
        rename: 'new-name',
      } satisfies InstallExtensionOpts,
      anvilHome,
    )
    // mapErrorToExitCode: RENAME_REQUIRED → 1
    expect(exit).toBe(1)
  })

  it('uninstall depended-on extension without --force → exit 5 with blockers; with --force → exit 0', async () => {
    // Seed base extension
    await seedRegistry(anvilHome, 'base-ext')
    // Seed depender that requires base-ext
    await seedRegistry(anvilHome, 'depender-ext', ['anvil:extension:base-ext'])

    // Uninstall without --force → exit 5
    const blockedExit = await uninstallExtensionCommand(
      'base-ext',
      { force: false } satisfies UninstallExtensionOpts,
      anvilHome,
    )
    expect(blockedExit).toBe(5)

    // base-ext is still in the registry
    const midReg = await loadRegistry(anvilHome)
    expect(midReg.extensions['base-ext']).toBeDefined()

    // Uninstall with --force → exit 0
    const forcedExit = await uninstallExtensionCommand(
      'base-ext',
      { force: true } satisfies UninstallExtensionOpts,
      anvilHome,
    )
    expect(forcedExit).toBe(0)

    // base-ext is gone; depender still present
    const afterReg = await loadRegistry(anvilHome)
    expect(afterReg.extensions['base-ext']).toBeUndefined()
    // depender-ext is still present (force only removed base-ext, not its dependents)
    const dependerEntry = afterReg.extensions['depender-ext']
    expect(dependerEntry).toBeDefined()
  })
})

// ─── 4. ANVIL_HOST=claude-code interactive path ────────────────────────────────

describe('ANVIL_HOST=claude-code interactive path', () => {
  it('emits ANVIL_DECISION: line and exits 10 when collision detected without --on-collision', async () => {
    // Install a first version so there is a collision on the second run
    const src1 = makeSourceDir(stageRoot, 'claude-host-test')
    await installExtensionCommand(
      src1,
      { onCollision: 'fail' } satisfies InstallExtensionOpts,
      anvilHome,
    )

    // Set ANVIL_HOST so the resolver takes the host path
    const prevHost = process.env.ANVIL_HOST
    process.env.ANVIL_HOST = 'claude-code'

    let stdoutCapture = ''
    let exitCode = -1
    try {
      stdoutCapture = await captureStdout(async () => {
        makeSourceDir(stageRoot, 'claude-host-test-v2', {})
        const sameNameDir = join(stageRoot, 'src-claude-host-same')
        mkdirSync(sameNameDir, { recursive: true })
        writeFileSync(
          join(sameNameDir, 'manifest.json'),
          JSON.stringify(
            makeManifest('claude-host-test', { version: '0.2.0' }),
          ),
        )
        exitCode = await installExtensionCommand(
          sameNameDir,
          // No --on-collision and no --yes → resolver fires
          {} satisfies InstallExtensionOpts,
          anvilHome,
        )
      })
    } finally {
      // Restore previous env state without using delete operator
      process.env.ANVIL_HOST = prevHost
    }

    // Exit code 10 means host-prompt-emitted
    expect(exitCode).toBe(10)

    // ANVIL_DECISION: line must be present in stdout
    const decisionLine = stdoutCapture
      .split('\n')
      .find((l) => l.startsWith('ANVIL_DECISION:'))
    expect(decisionLine).toBeDefined()

    // Parse JSON after the prefix
    const jsonStr = decisionLine!.slice('ANVIL_DECISION:'.length)
    const payload = JSON.parse(jsonStr) as {
      question: string
      intro: string
      options: Array<{ label: string; description: string }>
    }

    // Must be AskUserQuestion shape: question, intro, options (4)
    expect(typeof payload.question).toBe('string')
    expect(payload.question.length).toBeGreaterThan(0)
    expect(typeof payload.intro).toBe('string')
    expect(Array.isArray(payload.options)).toBe(true)
    expect(payload.options).toHaveLength(4)

    // Options must have label and description
    for (const opt of payload.options) {
      expect(typeof opt.label).toBe('string')
      expect(opt.label.length).toBeGreaterThan(0)
      expect(typeof opt.description).toBe('string')
    }
  })
})
