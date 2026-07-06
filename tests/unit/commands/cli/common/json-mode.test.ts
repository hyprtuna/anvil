import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { maybeEmitJson } from '../../../../../src/commands/cli/common/json-mode.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
const ANVIL_BIN = join(REPO_ROOT, 'bin', 'anvil.cjs')

describe('commands/cli/common/json-mode (Phase E3 — global --output)', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>
  const originalFmt = process.env.ANVIL_OUTPUT_FORMAT

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    writeSpy.mockRestore()
    if (originalFmt === undefined) {
      Reflect.deleteProperty(process.env, 'ANVIL_OUTPUT_FORMAT')
    } else {
      process.env.ANVIL_OUTPUT_FORMAT = originalFmt
    }
  })

  it('(a) global --output json (env=json) propagates without per-command --json', () => {
    process.env.ANVIL_OUTPUT_FORMAT = 'json'
    const emitted = maybeEmitJson({ foo: 1 }, {})
    expect(emitted).toBe(true)
    const out = writeSpy.mock.calls.map((c) => c[0]).join('')
    expect(JSON.parse(out)).toEqual({ foo: 1 })
  })

  it('(b) per-command --json still emits JSON regardless of env', () => {
    process.env.ANVIL_OUTPUT_FORMAT = 'text'
    const emitted = maybeEmitJson({ foo: 2 }, { json: true })
    expect(emitted).toBe(true)
    const out = writeSpy.mock.calls.map((c) => c[0]).join('')
    expect(JSON.parse(out)).toEqual({ foo: 2 })
  })

  it('(c) default (no env, no --json) returns false and writes nothing', () => {
    Reflect.deleteProperty(process.env, 'ANVIL_OUTPUT_FORMAT')
    const emitted = maybeEmitJson({ foo: 3 }, {})
    expect(emitted).toBe(false)
    expect(writeSpy.mock.calls.length).toBe(0)
  })

  it('(d) invalid --output value exits with code 1', () => {
    const result = spawnSync(
      'node',
      [ANVIL_BIN, '--output', 'yaml', 'doctor'],
      { encoding: 'utf-8' },
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      "Invalid --output: must be 'text' or 'json'",
    )
  })
})
