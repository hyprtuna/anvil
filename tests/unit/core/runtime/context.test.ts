/**
 * ANV-0176 Phase A — RuntimeContext shape + env/flag resolution.
 *
 * `RuntimeContext` carries the small set of session-scoped runtime knobs
 * that propagate from CLI flags / env vars down to the template renderer
 * and (in a follow-up ticket) the plan runner. Today the schema is two
 * booleans — autoMode and acceptDefaults — defaulting false. ANV-0175 will
 * extend it; the schema is intentionally narrow.
 */

import { describe, expect, it } from 'vitest'
import {
  RuntimeContext,
  resolveRuntimeContext,
} from '../../../../src/core/runtime/context.js'

describe('RuntimeContext schema', () => {
  it('parses an empty object with both flags defaulting to false', () => {
    const ctx = RuntimeContext.parse({})
    expect(ctx.autoMode).toBe(false)
    expect(ctx.acceptDefaults).toBe(false)
  })

  it('accepts explicit booleans', () => {
    const ctx = RuntimeContext.parse({
      autoMode: true,
      acceptDefaults: true,
    })
    expect(ctx.autoMode).toBe(true)
    expect(ctx.acceptDefaults).toBe(true)
  })

  it('rejects non-boolean fields', () => {
    expect(() => RuntimeContext.parse({ autoMode: 'yes' })).toThrow()
    expect(() => RuntimeContext.parse({ acceptDefaults: 1 })).toThrow()
  })

  it('rejects unknown keys (strict shape)', () => {
    expect(() =>
      RuntimeContext.parse({ autoMode: false, unknown: true }),
    ).toThrow()
  })
})

describe('resolveRuntimeContext — precedence', () => {
  it('defaults both flags to false when nothing is set', () => {
    const ctx = resolveRuntimeContext({ env: {}, cli: {} })
    expect(ctx).toEqual({ autoMode: false, acceptDefaults: false })
  })

  it('honors ANVIL_AUTO=1 from env', () => {
    const ctx = resolveRuntimeContext({ env: { ANVIL_AUTO: '1' }, cli: {} })
    expect(ctx.autoMode).toBe(true)
    expect(ctx.acceptDefaults).toBe(false)
  })

  it('honors ANVIL_AUTO_DEFAULTS=1 from env', () => {
    const ctx = resolveRuntimeContext({
      env: { ANVIL_AUTO_DEFAULTS: '1' },
      cli: {},
    })
    expect(ctx.autoMode).toBe(false)
    expect(ctx.acceptDefaults).toBe(true)
  })

  it('CLI flag wins over env (explicit false beats env=1)', () => {
    const ctx = resolveRuntimeContext({
      env: { ANVIL_AUTO: '1', ANVIL_AUTO_DEFAULTS: '1' },
      cli: { auto: false, acceptDefaults: false },
    })
    expect(ctx.autoMode).toBe(false)
    expect(ctx.acceptDefaults).toBe(false)
  })

  it('CLI flag wins over env (explicit true with env unset)', () => {
    const ctx = resolveRuntimeContext({
      env: {},
      cli: { auto: true, acceptDefaults: true },
    })
    expect(ctx.autoMode).toBe(true)
    expect(ctx.acceptDefaults).toBe(true)
  })

  it('CLI true overrides env undefined', () => {
    const ctx = resolveRuntimeContext({
      env: {},
      cli: { auto: true },
    })
    expect(ctx.autoMode).toBe(true)
    expect(ctx.acceptDefaults).toBe(false)
  })

  it('treats env values other than "1" as falsey', () => {
    const ctx = resolveRuntimeContext({
      env: { ANVIL_AUTO: '0', ANVIL_AUTO_DEFAULTS: 'true' },
      cli: {},
    })
    expect(ctx.autoMode).toBe(false)
    expect(ctx.acceptDefaults).toBe(false)
  })
})
