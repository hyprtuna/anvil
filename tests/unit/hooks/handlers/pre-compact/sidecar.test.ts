/**
 * Tests for pre-compact sidecar pure helpers (ANV-0126).
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RESTORE_WINDOW_MS,
  PRE_COMPACT_SIDECAR_VERSION,
  buildSidecar,
  isWithinRestoreWindow,
  parseSidecar,
  renderRestoreDigest,
  sidecarFilename,
  toFilesafeIso,
} from '../../../../../src/hooks/handlers/pre-compact/sidecar.js'

describe('buildSidecar', () => {
  it('emits the current schema version and ISO timestamp', () => {
    const t = new Date('2026-05-15T20:00:00.000Z')
    const s = buildSidecar({
      capturedAt: t,
      activeSkill: { name: 'debug' },
      activeRouting: null,
    })
    expect(s.version).toBe(PRE_COMPACT_SIDECAR_VERSION)
    expect(s.captured_at).toBe('2026-05-15T20:00:00.000Z')
    expect(s.active_skill).toEqual({ name: 'debug' })
    expect(s.active_routing).toBeNull()
    expect(s.summary).toBeNull()
  })

  it('preserves an explicit summary', () => {
    const s = buildSidecar({
      capturedAt: new Date(),
      activeSkill: null,
      activeRouting: null,
      summary: 'working on ANV-0126',
    })
    expect(s.summary).toBe('working on ANV-0126')
  })
})

describe('toFilesafeIso / sidecarFilename', () => {
  it('replaces colons and dots with dashes', () => {
    const t = new Date('2026-05-15T20:00:00.123Z')
    expect(toFilesafeIso(t)).toBe('2026-05-15T20-00-00-123Z')
    expect(sidecarFilename(t)).toBe('pre-compact-2026-05-15T20-00-00-123Z.json')
  })
})

describe('parseSidecar round-trip', () => {
  it('accepts a well-formed payload', () => {
    const payload = buildSidecar({
      capturedAt: new Date('2026-05-15T20:00:00.000Z'),
      activeSkill: { name: 'debug', intent: 'fix-broken' },
      activeRouting: { systemInsert: '[DIRECTIVE:ROUTING_HINT] use debug' },
    })
    const raw = JSON.stringify(payload)
    const round = parseSidecar(raw)
    expect(round).not.toBeNull()
    expect(round?.active_skill).toEqual({ name: 'debug', intent: 'fix-broken' })
  })

  it('rejects malformed JSON', () => {
    expect(parseSidecar('{not json')).toBeNull()
  })

  it('rejects wrong-version payloads', () => {
    const raw = JSON.stringify({
      version: 99,
      captured_at: new Date().toISOString(),
      active_skill: null,
      active_routing: null,
      summary: null,
    })
    expect(parseSidecar(raw)).toBeNull()
  })

  it('rejects payloads missing required fields', () => {
    const raw = JSON.stringify({
      version: PRE_COMPACT_SIDECAR_VERSION,
      captured_at: new Date().toISOString(),
    })
    expect(parseSidecar(raw)).toBeNull()
  })
})

describe('isWithinRestoreWindow', () => {
  it('returns true for a sidecar inside the window', () => {
    const now = Date.now()
    expect(isWithinRestoreWindow(now - 10_000, now)).toBe(true)
  })

  it('returns false for a sidecar older than the window', () => {
    const now = Date.now()
    expect(
      isWithinRestoreWindow(now - DEFAULT_RESTORE_WINDOW_MS - 1, now),
    ).toBe(false)
  })

  it('returns false for a sidecar with a future mtime well beyond clock-skew tolerance', () => {
    const now = Date.now()
    // 60s ahead is well past the 5s tolerance — must be rejected.
    expect(isWithinRestoreWindow(now + 60_000, now)).toBe(false)
  })

  it('tolerates a sidecar mtime slightly ahead of `now` (clock-skew tolerance)', () => {
    const now = Date.now()
    expect(isWithinRestoreWindow(now + 100, now)).toBe(true)
  })

  it('honors a custom windowMs', () => {
    const now = Date.now()
    expect(isWithinRestoreWindow(now - 5_000, now, 1_000)).toBe(false)
    expect(isWithinRestoreWindow(now - 500, now, 1_000)).toBe(true)
  })
})

describe('renderRestoreDigest', () => {
  it('wraps the digest in <session-restore> tags', () => {
    const s = buildSidecar({
      capturedAt: new Date('2026-05-15T20:00:00.000Z'),
      activeSkill: { name: 'debug', intent: 'fix-broken' },
      activeRouting: { systemInsert: 'route to debug' },
    })
    const d = renderRestoreDigest(s)
    expect(d.startsWith('<session-restore>')).toBe(true)
    expect(d.endsWith('</session-restore>')).toBe(true)
    expect(d).toContain('name=debug')
    expect(d).toContain('intent=fix-broken')
    expect(d).toContain('active_routing: route to debug')
  })

  it('omits sections that have no usable fields', () => {
    const s = buildSidecar({
      capturedAt: new Date(),
      activeSkill: null,
      activeRouting: null,
    })
    const d = renderRestoreDigest(s)
    expect(d).not.toContain('active_skill:')
    expect(d).not.toContain('active_routing:')
  })

  it('includes a summary when present', () => {
    const s = buildSidecar({
      capturedAt: new Date(),
      activeSkill: null,
      activeRouting: null,
      summary: 'mid-flight on ANV-0126',
    })
    const d = renderRestoreDigest(s)
    expect(d).toContain('summary: mid-flight on ANV-0126')
  })
})
