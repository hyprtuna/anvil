/**
 * Integration tests for `anvil statusline template` CLI — Plan 34 A5 / A8.
 *
 * These tests exercise `statuslineTemplateCommand` directly (no subprocess) using
 * a temporary home directory so they don't touch the real ~/.anvil/models.json.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resolveTemplate,
  statuslineTemplateCommand,
} from '../../src/commands/cli/statusline-template.js'

// ─── Test helpers ─────────────────────────────────────────────────────────────

let testHome: string
let modelsPath: string

let originalHome: string | undefined

beforeEach(async () => {
  testHome = join(tmpdir(), `anvil-template-test-${process.pid}-${Date.now()}`)
  await mkdir(join(testHome, '.anvil'), { recursive: true })
  modelsPath = join(testHome, '.anvil', 'models.json')

  // ANV-0268: production code routes homedir() through getUserHome() which
  // reads process.env.HOME first. Override the env var to isolate the test
  // from the real user home (works under both Node and Bun).
  originalHome = process.env.HOME
  process.env.HOME = testHome
})

afterEach(async () => {
  if (originalHome === undefined) {
    process.env.HOME = undefined
  } else {
    process.env.HOME = originalHome
  }
  await rm(testHome, { recursive: true, force: true })
})

// ─── resolveTemplate ─────────────────────────────────────────────────────────

describe('resolveTemplate', () => {
  it('returns default rich when no models.json', async () => {
    const { template, source } = await resolveTemplate()
    // No models.json written yet → default
    expect(source).toBe('default')
    expect(template).toBe('rich')
  })

  it('reads "simple" from models.json', async () => {
    await writeFile(
      modelsPath,
      JSON.stringify({ statusline: { template: 'simple' } }),
      'utf-8',
    )
    const { template, source } = await resolveTemplate()
    expect(template).toBe('simple')
    expect(source).toBe('user')
  })

  it('reads "rich" from models.json', async () => {
    await writeFile(
      modelsPath,
      JSON.stringify({ statusline: { template: 'rich' } }),
      'utf-8',
    )
    const { template, source } = await resolveTemplate()
    expect(template).toBe('rich')
    expect(source).toBe('user')
  })

  it('falls back to default when statusline key absent', async () => {
    await writeFile(modelsPath, JSON.stringify({ defaults: {} }), 'utf-8')
    const { template, source } = await resolveTemplate()
    expect(template).toBe('rich')
    expect(source).toBe('default')
  })

  it('falls back to default when template value is invalid', async () => {
    await writeFile(
      modelsPath,
      JSON.stringify({ statusline: { template: 'fancy' } }),
      'utf-8',
    )
    const { template, source } = await resolveTemplate()
    expect(template).toBe('rich')
    expect(source).toBe('default')
  })
})

// ─── statuslineTemplateCommand write mode ────────────────────────────────────

describe('statuslineTemplateCommand — write mode', () => {
  it('writes "simple" to models.json', async () => {
    await statuslineTemplateCommand({ template: 'simple' })
    const raw = await readFile(modelsPath, 'utf-8')
    const parsed = JSON.parse(raw) as { statusline?: { template?: string } }
    expect(parsed.statusline?.template).toBe('simple')
  })

  it('writes "rich" to models.json', async () => {
    await statuslineTemplateCommand({ template: 'rich' })
    const raw = await readFile(modelsPath, 'utf-8')
    const parsed = JSON.parse(raw) as { statusline?: { template?: string } }
    expect(parsed.statusline?.template).toBe('rich')
  })

  it('preserves existing statusline.tier when writing template', async () => {
    await writeFile(
      modelsPath,
      JSON.stringify({ statusline: { tier: 'maximal' } }),
      'utf-8',
    )
    await statuslineTemplateCommand({ template: 'simple' })
    const raw = await readFile(modelsPath, 'utf-8')
    const parsed = JSON.parse(raw) as {
      statusline?: { tier?: string; template?: string }
    }
    expect(parsed.statusline?.tier).toBe('maximal')
    expect(parsed.statusline?.template).toBe('simple')
  })

  it('preserves other root keys when writing template', async () => {
    await writeFile(
      modelsPath,
      JSON.stringify({ version: '1.0.0', statusline: { tier: 'default' } }),
      'utf-8',
    )
    await statuslineTemplateCommand({ template: 'rich' })
    const raw = await readFile(modelsPath, 'utf-8')
    const parsed = JSON.parse(raw) as { version?: string }
    expect(parsed.version).toBe('1.0.0')
  })

  it('exits 2 on invalid template value', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
      code: number,
    ) => {
      throw new Error(`process.exit(${code})`)
    }) as (code?: number) => never)

    await expect(
      statuslineTemplateCommand({ template: 'fancy' }),
    ).rejects.toThrow('process.exit(2)')

    exitSpy.mockRestore()
  })
})

// ─── statuslineTemplateCommand read mode + JSON output ───────────────────────

describe('statuslineTemplateCommand — read mode', () => {
  it('reads and outputs the current template with --json', async () => {
    await writeFile(
      modelsPath,
      JSON.stringify({ statusline: { template: 'simple' } }),
      'utf-8',
    )

    const writes: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((s) => {
      writes.push(String(s))
      return true
    })

    await statuslineTemplateCommand({ json: true })

    const combined = writes.join('')
    const parsed = JSON.parse(combined) as { template: string; source: string }
    expect(parsed.template).toBe('simple')
    expect(parsed.source).toBe('user')
  })

  it('returns default rich in JSON mode when no user config', async () => {
    const writes: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((s) => {
      writes.push(String(s))
      return true
    })

    await statuslineTemplateCommand({ json: true })

    const combined = writes.join('')
    const parsed = JSON.parse(combined) as { template: string; source: string }
    expect(parsed.template).toBe('rich')
    expect(parsed.source).toBe('default')
  })
})
