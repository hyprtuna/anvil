/**
 * Tests for gateguard/policy.ts — pure fact-evaluation logic.
 * Plan 43 Phase C — extracted from gateguard.ts shell.
 */
import { describe, expect, it } from 'vitest'
import {
  buildBlockMessage,
  evaluateFacts,
  isSchemaFile,
} from '../../../../../src/hooks/handlers/gateguard/policy.js'
import type { GateGuardState } from '../../../../../src/hooks/handlers/gateguard/state.js'

const TARGET = '/repo/src/feature/handler.ts'

function emptyState(): GateGuardState {
  return {
    sessionId: 'test',
    startedAt: new Date().toISOString(),
    userPromptSubmitted: false,
    reads: [],
    greps: [],
    globs: [],
    firstEditsCompleted: [],
  }
}

describe('isSchemaFile', () => {
  it('matches /types.ts at end of path', () => {
    expect(isSchemaFile('/repo/src/core/types.ts')).toBe(true)
  })

  it('matches *.types.ts', () => {
    expect(isSchemaFile('/repo/src/foo.types.ts')).toBe(true)
  })

  it('matches *.schema.* files', () => {
    expect(isSchemaFile('/repo/src/user.schema.json')).toBe(true)
  })

  it('matches schema*.ts pattern under a directory', () => {
    expect(isSchemaFile('/repo/src/db/schemas.ts')).toBe(true)
  })

  it('does not match arbitrary .ts files', () => {
    expect(isSchemaFile('/repo/src/handler.ts')).toBe(false)
  })
})

describe('evaluateFacts', () => {
  it('reports all 4 facts missing for an empty state', () => {
    const result = evaluateFacts(TARGET, emptyState())
    expect(result.satisfied).toBe(false)
    expect(result.missing).toHaveLength(4)
  })

  it('satisfies all 4 facts when state contains grep/read/schema/userPrompt', () => {
    const at = new Date().toISOString()
    const state: GateGuardState = {
      ...emptyState(),
      userPromptSubmitted: true,
      reads: [
        { path: TARGET, at },
        { path: '/repo/src/core/types.ts', at },
      ],
      greps: [{ pattern: 'handler', at }],
      globs: [],
    }
    const result = evaluateFacts(TARGET, state)
    expect(result.satisfied).toBe(true)
    expect(result.missing).toHaveLength(0)
  })

  it('accepts a glob covering target dir as Fact 1', () => {
    const at = new Date().toISOString()
    const state: GateGuardState = {
      ...emptyState(),
      userPromptSubmitted: true,
      reads: [
        { path: TARGET, at },
        { path: '/repo/src/core/types.ts', at },
      ],
      greps: [],
      globs: [{ pattern: '/repo/src/feature', at }],
    }
    expect(evaluateFacts(TARGET, state).satisfied).toBe(true)
  })

  it('reports Fact 4 missing when userPromptSubmitted is false', () => {
    const at = new Date().toISOString()
    const state: GateGuardState = {
      ...emptyState(),
      userPromptSubmitted: false,
      reads: [
        { path: TARGET, at },
        { path: '/repo/src/core/types.ts', at },
      ],
      greps: [{ pattern: 'handler', at }],
    }
    const result = evaluateFacts(TARGET, state)
    expect(result.satisfied).toBe(false)
    expect(result.missing.some((m) => m.includes('Fact 4'))).toBe(true)
  })
})

describe('buildBlockMessage', () => {
  it('renders the missing-facts list with disable hint', () => {
    const msg = buildBlockMessage(TARGET, ['Fact 1: do X', 'Fact 2: do Y'])
    expect(msg).toContain(`BLOCKED edit to "${TARGET}"`)
    expect(msg).toContain('1. Fact 1: do X')
    expect(msg).toContain('2. Fact 2: do Y')
    expect(msg).toContain('ANVIL_GATEGUARD')
  })
})
