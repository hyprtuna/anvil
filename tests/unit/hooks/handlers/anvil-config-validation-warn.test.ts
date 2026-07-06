/**
 * E-002 — anvil-config validation warn
 *
 * Verifies that both call sites (runtime-fallback.ts:isRuntimeFallbackEnabled
 * and gateguard/config.ts:isGateguardEnabled) route malformed-JSON and
 * Zod-fail errors through warnConfigInvalidOnce, writing a dedup'd line to
 * stderr instead of silently swallowing the error.
 *
 * Each describe block uses vi.resetModules() to get a fresh warn-once Set.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

// ── helpers ────────────────────────────────────────────────────────────────

function makeTmpCwd(): string {
  const d = createTestTmpDir('e002')
  mkdirSync(join(d, '.anvil'), { recursive: true })
  return d
}

function writeConfig(cwd: string, content: string): void {
  writeFileSync(join(cwd, '.anvil', 'anvil.config.json'), content, 'utf-8')
}

// ── E-002 site 1: runtime-fallback.ts:isRuntimeFallbackEnabled ──────────

describe('E-002 / runtime-fallback isRuntimeFallbackEnabled — malformed JSON', () => {
  let cwd: string
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.resetModules()
    cwd = makeTmpCwd()
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (existsSync(cwd)) rmSync(cwd, { recursive: true, force: true })
  })

  it('writes a stderr warning for malformed JSON config', async () => {
    writeConfig(cwd, '{ BAD JSON }')
    const { isRuntimeFallbackEnabled } = await import(
      '../../../../src/hooks/handlers/runtime-fallback.js'
    )
    const result = await isRuntimeFallbackEnabled(cwd, {})
    expect(result).toBe(false)
    expect(stderrSpy).toHaveBeenCalledTimes(1)
    const msg = stderrSpy.mock.calls[0][0] as string
    expect(msg).toContain('anvil hook')
    expect(msg).toContain('anvil.config.json')
    expect(msg).toContain('invalid')
    expect(msg).toContain('feature disabled')
  })
})

describe('E-002 / runtime-fallback isRuntimeFallbackEnabled — Zod fail', () => {
  let cwd: string
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.resetModules()
    cwd = makeTmpCwd()
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (existsSync(cwd)) rmSync(cwd, { recursive: true, force: true })
  })

  it('writes a stderr warning when JSON parses but Zod rejects schema', async () => {
    // valid JSON but schema-invalid (wrong types)
    writeConfig(
      cwd,
      JSON.stringify({ runtime_fallback: 'yes-not-bool', gateguard: 999 }),
    )
    const { isRuntimeFallbackEnabled } = await import(
      '../../../../src/hooks/handlers/runtime-fallback.js'
    )
    const result = await isRuntimeFallbackEnabled(cwd, {})
    expect(result).toBe(false)
    expect(stderrSpy).toHaveBeenCalledTimes(1)
    const msg = stderrSpy.mock.calls[0][0] as string
    expect(msg).toContain('invalid')
    expect(msg).toContain('feature disabled')
  })
})

describe('E-002 / runtime-fallback isRuntimeFallbackEnabled — dedup', () => {
  let cwd: string
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.resetModules()
    cwd = makeTmpCwd()
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (existsSync(cwd)) rmSync(cwd, { recursive: true, force: true })
  })

  it('only writes stderr once for the same absPath across multiple calls', async () => {
    writeConfig(cwd, '{ BAD JSON }')
    const { isRuntimeFallbackEnabled } = await import(
      '../../../../src/hooks/handlers/runtime-fallback.js'
    )
    await isRuntimeFallbackEnabled(cwd, {})
    await isRuntimeFallbackEnabled(cwd, {})
    expect(stderrSpy).toHaveBeenCalledTimes(1)
  })
})

// ── E-002 site 2: gateguard/config.ts:isGateguardEnabled ─────────────────

describe('E-002 / gateguard isGateguardEnabled — malformed JSON', () => {
  let cwd: string
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.resetModules()
    cwd = makeTmpCwd()
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (existsSync(cwd)) rmSync(cwd, { recursive: true, force: true })
  })

  it('writes a stderr warning for malformed JSON config', async () => {
    writeConfig(cwd, '<<< not json >>>')
    const { isGateguardEnabled } = await import(
      '../../../../src/hooks/handlers/gateguard/config.js'
    )
    const result = await isGateguardEnabled(cwd, {})
    expect(result).toBe(false)
    expect(stderrSpy).toHaveBeenCalledTimes(1)
    const msg = stderrSpy.mock.calls[0][0] as string
    expect(msg).toContain('anvil hook')
    expect(msg).toContain('anvil.config.json')
    expect(msg).toContain('invalid')
    expect(msg).toContain('feature disabled')
  })
})

describe('E-002 / gateguard isGateguardEnabled — Zod fail', () => {
  let cwd: string
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.resetModules()
    cwd = makeTmpCwd()
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (existsSync(cwd)) rmSync(cwd, { recursive: true, force: true })
  })

  it('writes a stderr warning when JSON parses but Zod rejects schema', async () => {
    writeConfig(
      cwd,
      JSON.stringify({ gateguard: 'nope', runtime_fallback: [] }),
    )
    const { isGateguardEnabled } = await import(
      '../../../../src/hooks/handlers/gateguard/config.js'
    )
    const result = await isGateguardEnabled(cwd, {})
    expect(result).toBe(false)
    expect(stderrSpy).toHaveBeenCalledTimes(1)
  })
})

describe('E-002 / gateguard isGateguardEnabled — dedup', () => {
  let cwd: string
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.resetModules()
    cwd = makeTmpCwd()
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (existsSync(cwd)) rmSync(cwd, { recursive: true, force: true })
  })

  it('only writes stderr once for the same absPath across multiple calls', async () => {
    writeConfig(cwd, '{ BAD JSON }')
    const { isGateguardEnabled } = await import(
      '../../../../src/hooks/handlers/gateguard/config.js'
    )
    await isGateguardEnabled(cwd, {})
    await isGateguardEnabled(cwd, {})
    expect(stderrSpy).toHaveBeenCalledTimes(1)
  })
})
