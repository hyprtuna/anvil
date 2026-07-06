/**
 * ANV-0070 — Unit tests for the CC hook event coverage matrix.
 *
 * Covers:
 *   1. CC_HOOK_EVENTS registry completeness (all 30 events present).
 *   2. Every event name in the registry matches the CC-documented name.
 *   3. Every entry has a valid HookEventStatus.
 *   4. All 'mapped' events in the registry correspond to HOOK_KIND_TO_EVENT values.
 *   5. pushCCHookCoverageCheck emits a pass row when the registry is intact.
 *   6. buildCCHookCoverageRow emits a warn row when count ≠ 30.
 *   7. buildCCHookCoverageRow emits a fail row when count is 0.
 */

import { describe, expect, it } from 'vitest'
import {
  buildCCHookCoverageRow,
  pushCCHookCoverageCheck,
} from '../../../../src/commands/cli/doctor.js'
import {
  CC_HOOK_EVENTS,
  type HookEventStatus,
} from '../../../../src/core/manifest-schema/cc-hook-events.js'
import { HOOK_KIND_TO_EVENT } from '../../../../src/core/manifest-schema/claude-code.js'

/** All 30 CC hook event names as documented by Claude Code. */
const EXPECTED_CC_EVENTS = new Set([
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PostToolBatch',
  'Notification',
  'Stop',
  'SubagentStop',
  'PreCompact',
  'UserPromptSubmit',
  'SessionStart',
  'Setup',
  'UserPromptExpansion',
  'PermissionRequest',
  'SubagentStart',
  'TaskCreated',
  'TaskCompleted',
  'TeammateIdle',
  'InstructionsLoaded',
  'ConfigChange',
  'CwdChanged',
  'FileChanged',
  'WorktreeCreate',
  'WorktreeRemove',
  'PostCompact',
  'Elicitation',
  'ElicitationResult',
  'PostEdit',
  'PreCommit',
  'PrePush',
  'OnError',
])

const VALID_STATUSES: readonly HookEventStatus[] = [
  'mapped',
  'future',
  'out-of-scope',
]

describe('CC_HOOK_EVENTS registry', () => {
  it('contains exactly 30 entries', () => {
    expect(CC_HOOK_EVENTS).toHaveLength(30)
  })

  it('every entry has one of the 30 documented CC event names', () => {
    for (const entry of CC_HOOK_EVENTS) {
      expect(EXPECTED_CC_EVENTS).toContain(entry.event)
    }
  })

  it('all 30 documented CC event names are present (no gaps)', () => {
    const registryEvents = new Set(CC_HOOK_EVENTS.map((e) => e.event))
    for (const name of EXPECTED_CC_EVENTS) {
      expect(registryEvents).toContain(name)
    }
  })

  it('no duplicate event names', () => {
    const seen = new Set<string>()
    for (const entry of CC_HOOK_EVENTS) {
      expect(seen).not.toContain(entry.event)
      seen.add(entry.event)
    }
  })

  it('every entry has a valid HookEventStatus', () => {
    for (const entry of CC_HOOK_EVENTS) {
      expect(VALID_STATUSES).toContain(entry.status)
    }
  })

  it('every entry has a non-empty note', () => {
    for (const entry of CC_HOOK_EVENTS) {
      expect(entry.note.trim().length).toBeGreaterThan(0)
    }
  })

  it('at least one event is mapped', () => {
    const mapped = CC_HOOK_EVENTS.filter((e) => e.status === 'mapped')
    expect(mapped.length).toBeGreaterThan(0)
  })

  it('every mapped event appears in HOOK_KIND_TO_EVENT values', () => {
    // HOOK_KIND_TO_EVENT includes SessionEnd which is NOT in the 30-event registry,
    // so the values superset the registry's mapped events.
    const ccEventValues = new Set(Object.values(HOOK_KIND_TO_EVENT))
    const mapped = CC_HOOK_EVENTS.filter((e) => e.status === 'mapped')
    for (const entry of mapped) {
      expect(ccEventValues).toContain(entry.event)
    }
  })
})

describe('buildCCHookCoverageRow (branch coverage)', () => {
  it('returns fail when events array is empty', () => {
    const row = buildCCHookCoverageRow([])
    expect(row.status).toBe('fail')
    expect(row.name).toBe('CC hook coverage')
    expect(row.detail).toMatch(/empty/)
  })

  it('returns warn when events array has fewer than 30 entries', () => {
    const short = Array.from({ length: 15 }, (_, _i) => ({
      status: 'mapped' as const,
    }))
    const row = buildCCHookCoverageRow(short)
    expect(row.status).toBe('warn')
    expect(row.detail).toMatch(/15 entries but CC documents 30/)
  })

  it('returns warn when events array has more than 30 entries', () => {
    const long = Array.from({ length: 31 }, (_, _i) => ({
      status: 'future' as const,
    }))
    const row = buildCCHookCoverageRow(long)
    expect(row.status).toBe('warn')
    expect(row.detail).toMatch(/31 entries but CC documents 30/)
  })

  it('returns pass with correct counts for exactly 30 entries', () => {
    const events = [
      ...Array.from({ length: 8 }, () => ({ status: 'mapped' as const })),
      ...Array.from({ length: 13 }, () => ({ status: 'future' as const })),
      ...Array.from({ length: 9 }, () => ({ status: 'out-of-scope' as const })),
    ]
    const row = buildCCHookCoverageRow(events)
    expect(row.status).toBe('pass')
    expect(row.detail).toBe('8/30 mapped, 13 future, 9 out-of-scope')
  })
})

describe('doctor row: CC hook coverage', () => {
  it('emits a pass row when the registry is intact', async () => {
    const checks: Array<{ name: string; status: string; detail: string }> = []
    await pushCCHookCoverageCheck(checks)
    expect(checks).toHaveLength(1)
    const row = checks[0]
    expect(row.name).toBe('CC hook coverage')
    expect(row.status).toBe('pass')
    expect(row.detail).toMatch(/\d+\/30 mapped, \d+ future, \d+ out-of-scope/)
  })

  it('pass detail counts sum to 30', async () => {
    const checks: Array<{ name: string; status: string; detail: string }> = []
    await pushCCHookCoverageCheck(checks)
    const row = checks[0]
    const match = row.detail.match(
      /(\d+)\/30 mapped, (\d+) future, (\d+) out-of-scope/,
    )
    expect(match).not.toBeNull()
    if (match) {
      const [, mappedStr, futureStr, oosStr] = match
      const sum = Number(mappedStr) + Number(futureStr) + Number(oosStr)
      expect(sum).toBe(30)
    }
  })

  it('mapped count in detail matches actual registry mapped entries', async () => {
    const expectedMapped = CC_HOOK_EVENTS.filter(
      (e) => e.status === 'mapped',
    ).length
    const checks: Array<{ name: string; status: string; detail: string }> = []
    await pushCCHookCoverageCheck(checks)
    const row = checks[0]
    expect(row.status).toBe('pass')
    expect(row.detail).toContain(`${expectedMapped}/30 mapped`)
  })
})
