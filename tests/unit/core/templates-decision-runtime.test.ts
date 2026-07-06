import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  type DecisionAutoModeOutcome,
  type DecisionPrompt,
  resolveDecisionAutoMode,
  writeDecisionAuditEntry,
} from '../../../src/core/templates/index.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

const prompt: DecisionPrompt = {
  question: 'Which library?',
  explanation: 'Need to lock down the build before phase 2.',
  options: [
    {
      label: 'A',
      description: 'use library X',
      recommended: true,
      rationale: 'broader ecosystem',
    },
    { label: 'B', description: 'use library Y' },
  ],
  confidence: 'high',
}

describe('writeDecisionAuditEntry', () => {
  let anvilRoot: string
  beforeEach(() => {
    anvilRoot = createTestTmpDir('anvil-decisions-audit')
  })
  it('writes a JSON audit entry when policy resolves to auto-select', () => {
    const outcome = resolveDecisionAutoMode(prompt, { enabled: true })
    expect(outcome.action).toBe('auto-select')
    const path = writeDecisionAuditEntry(prompt, outcome, anvilRoot)
    expect(path).toBeDefined()
    expect(path && existsSync(path)).toBe(true)
    const decisionsDir = join(anvilRoot, 'decisions')
    const files = readdirSync(decisionsDir)
    expect(files).toHaveLength(1)
    const entry = JSON.parse(readFileSync(path as string, 'utf-8'))
    expect(entry.question).toBe('Which library?')
    expect(entry.selectedLabel).toBe('A')
    expect(entry.reason).toBe('auto-mode-high-confidence')
    expect(entry.confidence).toBe('high')
    expect(entry.rationale).toBe('broader ecosystem')
    expect(typeof entry.timestamp).toBe('string')
  })

  it('records reason as accept-defaults when that carve-out fired', () => {
    const outcome = resolveDecisionAutoMode(prompt, { acceptDefaults: true })
    expect(outcome.action).toBe('auto-select')
    const path = writeDecisionAuditEntry(prompt, outcome, anvilRoot)
    expect(path).toBeDefined()
    const entry = JSON.parse(readFileSync(path as string, 'utf-8'))
    expect(entry.reason).toBe('accept-defaults')
  })

  it('returns undefined when outcome is wait', () => {
    const waitOutcome: DecisionAutoModeOutcome = {
      action: 'wait',
      reason: 'auto-mode-off',
    }
    expect(
      writeDecisionAuditEntry(prompt, waitOutcome, anvilRoot),
    ).toBeUndefined()
    expect(existsSync(join(anvilRoot, 'decisions'))).toBe(false)
  })

  it('returns undefined when anvilRoot is not supplied', () => {
    const outcome = resolveDecisionAutoMode(prompt, { enabled: true })
    expect(writeDecisionAuditEntry(prompt, outcome, undefined)).toBeUndefined()
  })

  it('creates the decisions/ directory when absent', () => {
    const outcome = resolveDecisionAutoMode(prompt, { enabled: true })
    expect(existsSync(join(anvilRoot, 'decisions'))).toBe(false)
    writeDecisionAuditEntry(prompt, outcome, anvilRoot)
    expect(existsSync(join(anvilRoot, 'decisions'))).toBe(true)
  })
})
