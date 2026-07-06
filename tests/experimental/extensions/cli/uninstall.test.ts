/**
 * Tests for `anvil extension uninstall` CLI command (P3).
 */

import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installExtensionCommand } from '../../../../src/experimental/extensions/cli/install.js'
import { uninstallExtensionCommand } from '../../../../src/experimental/extensions/cli/uninstall.js'

let tmpBase: string

beforeEach(async () => {
  const { mkdtemp } = await import('node:fs/promises')
  const { join: pjoin } = await import('node:path')
  const { tmpdir } = await import('node:os')
  tmpBase = await mkdtemp(pjoin(tmpdir(), 'anvil-ext-uninstall-test-'))
})

afterEach(async () => {
  await rm(tmpBase, { recursive: true, force: true })
})

function home(): string {
  return join(tmpBase, 'home')
}

async function installExt(
  name: string,
  requires: string[] = [],
  version = '1.0.0',
): Promise<void> {
  const { mkdir, writeFile } = await import('node:fs/promises')
  const dir = join(tmpBase, `src-${name}`)
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'manifest.json'),
    `${JSON.stringify({
      schema_version: '1.0.0',
      name,
      version,
      description: `Extension ${name}`,
      kind: 'extension',
      provides: {},
      requires,
      compatibility: { min_anvil_version: '0.1.0' },
    })}\n`,
    'utf-8',
  )
  await installExtensionCommand(
    dir,
    { onCollision: 'abort', yes: false, json: false },
    home(),
  )
}

async function captureStdout(fn: () => Promise<unknown>): Promise<string> {
  const lines: string[] = []
  const orig = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk: unknown) => {
    lines.push(String(chunk))
    return true
  }
  try {
    await fn()
  } finally {
    process.stdout.write = orig
  }
  return lines.join('')
}

// ─── Uninstall installed extension ────────────────────────────────────────────

describe('uninstallExtensionCommand — normal uninstall', () => {
  it('uninstalls an installed extension and returns exit code 0', async () => {
    await installExt('foo-ext')
    const code = await uninstallExtensionCommand(
      'foo-ext',
      { force: false, json: false },
      home(),
    )
    expect(code).toBe(0)
  })

  it('--json emits { status: "uninstalled", name, blockers: [] }', async () => {
    await installExt('bar-ext')
    const out = await captureStdout(() =>
      uninstallExtensionCommand(
        'bar-ext',
        { force: false, json: true },
        home(),
      ),
    )
    const parsed = JSON.parse(out) as {
      status: string
      name: string
      blockers: string[]
    }
    expect(parsed.status).toBe('uninstalled')
    expect(parsed.name).toBe('bar-ext')
    expect(parsed.blockers).toEqual([])
  })
})

// ─── Not found ────────────────────────────────────────────────────────────────

describe('uninstallExtensionCommand — not found', () => {
  it('returns exit code 0 with status not-found when extension not installed', async () => {
    const code = await uninstallExtensionCommand(
      'does-not-exist',
      { force: false, json: false },
      home(),
    )
    expect(code).toBe(0)
  })

  it('--json emits { status: "not-found" } for missing extension', async () => {
    const out = await captureStdout(() =>
      uninstallExtensionCommand(
        'missing',
        { force: false, json: true },
        home(),
      ),
    )
    const parsed = JSON.parse(out) as { status: string }
    expect(parsed.status).toBe('not-found')
  })
})

// ─── Dependency blocking ──────────────────────────────────────────────────────

describe('uninstallExtensionCommand — dependency blocking', () => {
  it('exits 5 when another extension requires it (body equals extension:<name>)', async () => {
    await installExt('base-lib')
    // dependent has requires: ['anvil:extension:base-lib'] which parses as URI body 'extension:base-lib'
    await installExt('dep-ext', ['anvil:extension:base-lib'])
    const code = await uninstallExtensionCommand(
      'base-lib',
      { force: false, json: false },
      home(),
    )
    expect(code).toBe(5)
  })

  it('exits 5 when another extension requires <name>/... pattern', async () => {
    await installExt('shared-lib')
    await installExt('uses-shared', ['anvil:shared-lib/skill-one'])
    const code = await uninstallExtensionCommand(
      'shared-lib',
      { force: false, json: false },
      home(),
    )
    expect(code).toBe(5)
  })

  it('--json shows blockers list when blocked', async () => {
    await installExt('core-ext')
    await installExt('child-ext', ['anvil:extension:core-ext'])
    const out = await captureStdout(() =>
      uninstallExtensionCommand(
        'core-ext',
        { force: false, json: true },
        home(),
      ),
    )
    const parsed = JSON.parse(out) as {
      status: string
      blockers: string[]
    }
    expect(parsed.status).toBe('blocked')
    expect(parsed.blockers).toContain('child-ext')
  })

  it('--force overrides blocker and returns 0', async () => {
    await installExt('forced-base')
    await installExt('forced-dep', ['anvil:extension:forced-base'])
    const code = await uninstallExtensionCommand(
      'forced-base',
      { force: true, json: false },
      home(),
    )
    expect(code).toBe(0)
  })
})

// ─── Conservative match details ────────────────────────────────────────────────

describe('uninstallExtensionCommand — conservative requires match', () => {
  it('URI body "extension:<name>" blocks uninstall of <name>', async () => {
    // 'anvil:extension:alpha' → body = 'extension:alpha'
    await installExt('alpha')
    await installExt('beta', ['anvil:extension:alpha'])
    expect(
      await uninstallExtensionCommand(
        'alpha',
        { force: false, json: false },
        home(),
      ),
    ).toBe(5)
  })

  it('URI body "<name>/skill-bar" blocks uninstall of <name>', async () => {
    // 'anvil:gamma/skill-bar' → body = 'gamma/skill-bar' starts with 'gamma/'
    await installExt('gamma')
    await installExt('delta', ['anvil:gamma/skill-bar'])
    expect(
      await uninstallExtensionCommand(
        'gamma',
        { force: false, json: false },
        home(),
      ),
    ).toBe(5)
  })

  it('unrelated requires URI does NOT block', async () => {
    // 'anvil:other-thing' → body = 'other-thing', does not match 'gamma'
    await installExt('epsilon')
    await installExt('zeta', ['anvil:some-other-thing'])
    expect(
      await uninstallExtensionCommand(
        'epsilon',
        { force: false, json: false },
        home(),
      ),
    ).toBe(0)
  })
})
