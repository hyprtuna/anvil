/**
 * Tests for workflow-guard/gates.ts pure helpers.
 * Plan 43 Phase D — extracted from workflow-guard.ts shell.
 */
import { describe, expect, it } from 'vitest'
import { WorkflowConfig as WorkflowConfigSchema } from '../../../../../src/core/types.js'
import {
  buildRedirectMessage,
  hardGatesFromConfig,
} from '../../../../../src/hooks/handlers/workflow-guard/gates.js'
import { isSourceFile } from '../../../../../src/hooks/handlers/workflow-guard/source-detect.js'

describe('isSourceFile', () => {
  it('rejects .md docs', () => {
    expect(isSourceFile('docs/anvil/plan.md')).toBe(false)
    expect(isSourceFile('README.md')).toBe(false)
  })

  it('rejects dotfiles and .anvil/.claude/.opencode/node_modules', () => {
    expect(isSourceFile('.eslintrc')).toBe(false)
    expect(isSourceFile('.anvil/state.json')).toBe(false)
    expect(isSourceFile('.claude/settings.json')).toBe(false)
    expect(isSourceFile('.opencode/opencode.json')).toBe(false)
    expect(isSourceFile('node_modules/foo/index.js')).toBe(false)
  })

  it('rejects package.json + package-lock.json + tsconfig', () => {
    expect(isSourceFile('package.json')).toBe(false)
    expect(isSourceFile('package-lock.json')).toBe(false)
    expect(isSourceFile('tsconfig.json')).toBe(false)
  })

  it('accepts source files', () => {
    expect(isSourceFile('src/handler.ts')).toBe(true)
    expect(isSourceFile('src/index.tsx')).toBe(true)
    expect(isSourceFile('lib/util.js')).toBe(true)
  })
})

describe('hardGatesFromConfig', () => {
  it('returns empty set when all gates explicitly disabled', () => {
    const config = WorkflowConfigSchema.parse({
      research_gate: false,
      plan_check: false,
      decision_coverage: false,
      verification: false,
      context_coverage: false,
    })
    const gates = hardGatesFromConfig(config)
    expect(gates.size).toBe(0)
  })

  it('returns the schema-default hard gates (plan_check, decision_coverage, verification)', () => {
    const config = WorkflowConfigSchema.parse({})
    const gates = hardGatesFromConfig(config)
    expect(gates.has('plan_check')).toBe(true)
    expect(gates.has('decision_coverage')).toBe(true)
    expect(gates.has('verification')).toBe(true)
    expect(gates.has('research_gate')).toBe(false)
    expect(gates.has('context_coverage')).toBe(false)
  })

  it('includes only gates that are enabled', () => {
    const config = WorkflowConfigSchema.parse({
      research_gate: true,
      plan_check: true,
      decision_coverage: false,
    })
    const gates = hardGatesFromConfig(config)
    expect(gates.has('research_gate')).toBe(true)
    expect(gates.has('plan_check')).toBe(true)
    expect(gates.has('decision_coverage')).toBe(false)
  })
})

describe('buildRedirectMessage', () => {
  it('wraps in <system-reminder> with gate name + ANVIL_FORCE bypass hint', () => {
    const msg = buildRedirectMessage({
      gate: 'research_gate',
      message: 'spec.md missing.',
    })
    expect(msg).toContain('<system-reminder>')
    expect(msg).toContain('WORKFLOW GATE BLOCKED: research_gate')
    expect(msg).toContain('spec.md missing.')
    expect(msg).toContain('ANVIL_FORCE=1')
    expect(msg).toContain('</system-reminder>')
  })
})
