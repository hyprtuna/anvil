/**
 * Tests for `anvil extension install` CLI command (P3 + P5).
 */

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  type InstallExtensionOpts,
  installExtensionCommand,
} from '../../../../src/experimental/extensions/cli/install.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeManifest(name = 'my-ext', version = '1.0.0') {
  return {
    schema_version: '1.0.0',
    name,
    version,
    description: 'A test extension',
    kind: 'extension',
    provides: {},
    requires: [],
    compatibility: { min_anvil_version: '0.1.0' },
  }
}

let tmpBase: string

beforeEach(async () => {
  tmpBase = await (async () => {
    const { mkdtemp } = await import('node:fs/promises')
    const { join: pjoin } = await import('node:path')
    const { tmpdir } = await import('node:os')
    return mkdtemp(pjoin(tmpdir(), 'anvil-ext-install-test-'))
  })()
})

afterEach(async () => {
  await rm(tmpBase, { recursive: true, force: true })
})

async function makeExtDir(name = 'my-ext'): Promise<string> {
  const dir = join(tmpBase, `source-${name}`)
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'manifest.json'),
    `${JSON.stringify(makeManifest(name))}\n`,
    'utf-8',
  )
  return dir
}

function anvilHome(): string {
  return join(tmpBase, 'anvil-home')
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('installExtensionCommand — happy path', () => {
  it('installs a directory extension and returns exit code 0', async () => {
    const sourceDir = await makeExtDir()
    const opts: InstallExtensionOpts = {
      onCollision: 'abort',
      yes: false,
      json: false,
    }
    const code = await installExtensionCommand(sourceDir, opts, anvilHome())
    expect(code).toBe(0)
  })

  it('--json emits JSON and returns exit code 0', async () => {
    const sourceDir = await makeExtDir()
    const opts: InstallExtensionOpts = {
      onCollision: 'abort',
      yes: false,
      json: true,
    }
    const lines: string[] = []
    const orig = process.stdout.write.bind(process.stdout)
    process.stdout.write = (chunk: unknown) => {
      lines.push(String(chunk))
      return true
    }
    try {
      const code = await installExtensionCommand(sourceDir, opts, anvilHome())
      expect(code).toBe(0)
    } finally {
      process.stdout.write = orig
    }
    const out = lines.join('')
    const parsed = JSON.parse(out) as Record<string, unknown>
    expect(parsed.status).toBe('installed')
    expect(parsed.name).toBe('my-ext')
    expect(parsed.version).toBe('1.0.0')
    expect(Array.isArray(parsed.collisions)).toBe(true)
  })
})

// ─── Exit code mapping ────────────────────────────────────────────────────────

describe('installExtensionCommand — exit code mapping', () => {
  it('exits 1 for INVALID_MANIFEST (missing manifest.json)', async () => {
    const dir = join(tmpBase, 'empty-dir')
    await mkdir(dir, { recursive: true })
    const opts: InstallExtensionOpts = {
      onCollision: 'abort',
      yes: false,
      json: false,
    }
    const code = await installExtensionCommand(dir, opts, anvilHome())
    expect(code).toBe(1)
  })

  it('exits 1 for INVALID_MANIFEST (malformed manifest.json)', async () => {
    const dir = join(tmpBase, 'bad-manifest')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'manifest.json'), 'not-json', 'utf-8')
    const opts: InstallExtensionOpts = {
      onCollision: 'abort',
      yes: false,
      json: false,
    }
    const code = await installExtensionCommand(dir, opts, anvilHome())
    expect(code).toBe(1)
  })

  it('exits 3 for UNRESOLVED_COLLISION (collision + abort strategy)', async () => {
    // Install once to create a collision
    const sourceDir = await makeExtDir()
    const home = anvilHome()
    await installExtensionCommand(
      sourceDir,
      { onCollision: 'abort', yes: false, json: false },
      home,
    )
    // Second install — same name → collision
    const source2 = await makeExtDir('my-ext')
    const code = await installExtensionCommand(
      source2,
      { onCollision: 'abort', yes: false, json: false },
      home,
    )
    expect(code).toBe(3)
  })

  it('exits 3 for UNRESOLVED_COLLISION (collision + fail strategy)', async () => {
    const home = anvilHome()
    await installExtensionCommand(
      await makeExtDir(),
      { onCollision: 'abort', yes: false, json: false },
      home,
    )
    const code = await installExtensionCommand(
      await makeExtDir('my-ext'),
      { onCollision: 'fail', yes: false, json: false },
      home,
    )
    expect(code).toBe(3)
  })

  it('exits 4 when no --on-collision and --yes not set (non-interactive)', async () => {
    const sourceDir = await makeExtDir()
    const opts: InstallExtensionOpts = {
      // onCollision absent means P5 interactive path — but for P3 we treat as non-interactive
      yes: false,
      json: false,
    }
    // Install first, so there IS a collision to trigger the code-4 path
    const home = anvilHome()
    await installExtensionCommand(
      await makeExtDir(),
      { onCollision: 'abort', yes: false, json: false },
      home,
    )
    const code = await installExtensionCommand(sourceDir, opts, home)
    expect(code).toBe(4)
  })

  it('exits 1 for RENAME_REQUIRED when --rename missing with strategy=rename', async () => {
    const sourceDir = await makeExtDir()
    const opts: InstallExtensionOpts = {
      onCollision: 'rename',
      // rename intentionally absent
      yes: false,
      json: false,
    }
    const code = await installExtensionCommand(sourceDir, opts, anvilHome())
    expect(code).toBe(1)
  })
})

// ─── --rename flag ─────────────────────────────────────────────────────────────

describe('installExtensionCommand — --rename flag', () => {
  it('installs with rename strategy and new name', async () => {
    const sourceDir = await makeExtDir()
    const opts: InstallExtensionOpts = {
      onCollision: 'rename',
      rename: 'my-ext-renamed',
      yes: false,
      json: false,
    }
    const code = await installExtensionCommand(sourceDir, opts, anvilHome())
    expect(code).toBe(0)
  })

  it('exits 1 when --rename is provided but onCollision is not rename', async () => {
    const sourceDir = await makeExtDir()
    const opts: InstallExtensionOpts = {
      onCollision: 'abort',
      rename: 'should-not-matter',
      yes: false,
      json: false,
    }
    // --rename with a non-rename strategy should fail at validation
    const code = await installExtensionCommand(sourceDir, opts, anvilHome())
    expect(code).toBe(1)
  })
})

// ─── --yes flag ────────────────────────────────────────────────────────────────

describe('installExtensionCommand — --yes flag', () => {
  it('--yes without --on-collision defaults to abort strategy (exits 3 on collision)', async () => {
    const home = anvilHome()
    // Install once
    await installExtensionCommand(
      await makeExtDir(),
      { onCollision: 'abort', yes: false, json: false },
      home,
    )
    // Second install with --yes but no --on-collision → default abort → exit 3
    const code = await installExtensionCommand(
      await makeExtDir('my-ext'),
      { yes: true, json: false },
      home,
    )
    expect(code).toBe(3)
  })

  it('--yes without --on-collision succeeds (exit 0) when no collision', async () => {
    const code = await installExtensionCommand(
      await makeExtDir(),
      { yes: true, json: false },
      anvilHome(),
    )
    expect(code).toBe(0)
  })
})

// ─── P5 — Interactive resolution ──────────────────────────────────────────────

describe('installExtensionCommand — P5 interactive resolution paths', () => {
  let origEnv: NodeJS.ProcessEnv
  let stdoutLines: string[]
  let stderrLines: string[]
  let origStdout: typeof process.stdout.write
  let origStderr: typeof process.stderr.write

  beforeEach(() => {
    origEnv = { ...process.env }
    stdoutLines = []
    stderrLines = []
    origStdout = process.stdout.write.bind(process.stdout)
    origStderr = process.stderr.write.bind(process.stderr)
    process.stdout.write = (chunk: unknown) => {
      stdoutLines.push(String(chunk))
      return true
    }
    process.stderr.write = (chunk: unknown) => {
      stderrLines.push(String(chunk))
      return true
    }
  })

  afterEach(() => {
    process.stdout.write = origStdout
    process.stderr.write = origStderr
    process.env = origEnv
  })

  it('exits 10 and emits ANVIL_DECISION: line when collision + ANVIL_HOST=claude-code + no flags', async () => {
    const home = anvilHome()
    // First install to create a collision
    await installExtensionCommand(
      await makeExtDir(),
      { onCollision: 'abort', yes: false, json: false },
      home,
    )
    process.env.ANVIL_HOST = 'claude-code'
    // Second install with no --on-collision, not --yes
    const code = await installExtensionCommand(
      await makeExtDir('my-ext'),
      { yes: false, json: false },
      home,
    )
    expect(code).toBe(10)
    const allOutput = stdoutLines.join('')
    const decisionLine = allOutput
      .split('\n')
      .find((l) => l.startsWith('ANVIL_DECISION:'))
    expect(decisionLine).toBeDefined()
  })

  it('exits 4 when no collision resolution channel available (no TTY, no host)', async () => {
    const home = anvilHome()
    process.env.ANVIL_HOST = undefined
    // First install to create collision
    await installExtensionCommand(
      await makeExtDir(),
      { onCollision: 'abort', yes: false, json: false },
      home,
    )
    // Second install without flags, without host
    const code = await installExtensionCommand(
      await makeExtDir('my-ext'),
      { yes: false, json: false },
      home,
    )
    expect(code).toBe(4)
    const errOutput = stderrLines.join('')
    expect(errOutput).toMatch(/--on-collision/)
  })
})
