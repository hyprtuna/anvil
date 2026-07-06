/**
 * Tests for `anvil extension list` CLI command (P3).
 */

import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installExtensionCommand } from '../../../../src/experimental/extensions/cli/install.js'
import { listExtensionsCommand } from '../../../../src/experimental/extensions/cli/list.js'
import type { Registry } from '../../../../src/installer/extensions/registry-types.js'

let tmpBase: string

beforeEach(async () => {
  const { mkdtemp } = await import('node:fs/promises')
  const { join: pjoin } = await import('node:path')
  const { tmpdir } = await import('node:os')
  tmpBase = await mkdtemp(pjoin(tmpdir(), 'anvil-ext-list-test-'))
})

afterEach(async () => {
  await rm(tmpBase, { recursive: true, force: true })
})

function home(): string {
  return join(tmpBase, 'home')
}

async function installExt(name: string, version = '1.0.0'): Promise<void> {
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
      requires: [],
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

describe('listExtensionsCommand — empty registry', () => {
  it('exits 0 when registry is empty', async () => {
    const code = await listExtensionsCommand(
      { json: false, verbose: false },
      home(),
    )
    expect(code).toBe(0)
  })

  it('outputs empty table header or empty message', async () => {
    const out = await captureStdout(() =>
      listExtensionsCommand({ json: false, verbose: false }, home()),
    )
    // Should mention "no extensions" or output table with no rows
    expect(out.toLowerCase()).toMatch(/no extension|name.*version/i)
  })

  it('--json outputs empty extensions object', async () => {
    const out = await captureStdout(() =>
      listExtensionsCommand({ json: true, verbose: false }, home()),
    )
    const parsed = JSON.parse(out) as Registry
    expect(parsed.schema_version).toBe('1.0.0')
    expect(parsed.extensions).toEqual({})
  })
})

describe('listExtensionsCommand — one extension', () => {
  it('exits 0 and shows the extension', async () => {
    await installExt('alpha-tool')
    const out = await captureStdout(() =>
      listExtensionsCommand({ json: false, verbose: false }, home()),
    )
    expect(out).toContain('alpha-tool')
    expect(out).toContain('1.0.0')
  })

  it('--json shows the extension in extensions map', async () => {
    await installExt('beta-tool', '2.3.4')
    const out = await captureStdout(() =>
      listExtensionsCommand({ json: true, verbose: false }, home()),
    )
    const parsed = JSON.parse(out) as Registry
    expect(parsed.extensions['beta-tool']).toBeDefined()
    expect(parsed.extensions['beta-tool'].version).toBe('2.3.4')
  })
})

describe('listExtensionsCommand — multiple extensions', () => {
  it('shows all installed extensions', async () => {
    await installExt('ext-one')
    await installExt('ext-two', '0.5.0')
    const out = await captureStdout(() =>
      listExtensionsCommand({ json: false, verbose: false }, home()),
    )
    expect(out).toContain('ext-one')
    expect(out).toContain('ext-two')
  })
})

describe('listExtensionsCommand — --verbose', () => {
  it('adds source and install date columns', async () => {
    await installExt('verbose-ext')
    const out = await captureStdout(() =>
      listExtensionsCommand({ json: false, verbose: true }, home()),
    )
    // Verbose output should mention source info (the kind: directory)
    expect(out.toLowerCase()).toMatch(/directory|source|installed/i)
  })
})
