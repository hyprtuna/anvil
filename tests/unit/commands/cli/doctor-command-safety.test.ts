import { describe, expect, it } from 'vitest'
import {
  COMMAND_REGISTRY,
  computeCommandSafetyCoverage,
} from '../../../../src/commands/cli/common/command-registry.js'

/**
 * ANV-0022 — Command safety metadata (MCP-canonical 4-tuple).
 *
 * Pure function under test: every registered command must declare all four
 * MCP-SDK hint fields. The doctor row warns when any command is missing
 * safety annotations.
 */

describe('COMMAND_REGISTRY', () => {
  it('every registered command has all four MCP 4-tuple hint fields', () => {
    const missing: string[] = []
    for (const cmd of COMMAND_REGISTRY) {
      const a = cmd.safety
      if (
        typeof a.readOnlyHint !== 'boolean' ||
        typeof a.destructiveHint !== 'boolean' ||
        typeof a.idempotentHint !== 'boolean' ||
        typeof a.openWorldHint !== 'boolean'
      ) {
        missing.push(cmd.name)
      }
    }
    expect(missing).toEqual([])
  })

  it('every command has a non-empty slug', () => {
    for (const cmd of COMMAND_REGISTRY) {
      expect(cmd.name.length).toBeGreaterThan(0)
    }
  })

  it('readOnlyHint and destructiveHint are not simultaneously true', () => {
    const contradictory: string[] = []
    for (const cmd of COMMAND_REGISTRY) {
      if (cmd.safety.readOnlyHint && cmd.safety.destructiveHint) {
        contradictory.push(cmd.name)
      }
    }
    expect(contradictory).toEqual([])
  })
})

describe('computeCommandSafetyCoverage', () => {
  it('returns pass when every command has all four hints', () => {
    const cmds = [
      {
        name: 'doctor',
        safety: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'init',
        safety: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
    ]
    const r = computeCommandSafetyCoverage(cmds)
    expect(r.status).toBe('pass')
    expect(r.covered).toBe(2)
    expect(r.total).toBe(2)
  })

  it('returns warn when a command is missing hints (partial object)', () => {
    const cmds = [
      {
        name: 'broken',
        safety: {
          readOnlyHint: true,
          destructiveHint: false,
          // missing idempotentHint and openWorldHint
        } as unknown as {
          readOnlyHint: boolean
          destructiveHint: boolean
          idempotentHint: boolean
          openWorldHint: boolean
        },
      },
    ]
    const r = computeCommandSafetyCoverage(cmds)
    expect(r.status).toBe('warn')
    expect(r.covered).toBe(0)
    expect(r.total).toBe(1)
  })

  it('returns skip when no commands are registered', () => {
    const r = computeCommandSafetyCoverage([])
    expect(r.status).toBe('skip')
  })

  it('flags contradictory annotations (readOnly + destructive both true)', () => {
    const cmds = [
      {
        name: 'bad-cmd',
        safety: {
          readOnlyHint: true,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
    ]
    const r = computeCommandSafetyCoverage(cmds)
    expect(r.contradictory).toContain('bad-cmd')
  })
})
