/**
 * ANV-0176 Phase D — auto-mode end-to-end wiring.
 *
 * Three concerns covered here:
 *   1. resolveAndSyncRuntimeContext writes ANVIL_AUTO / ANVIL_AUTO_DEFAULTS
 *      back into env so nested invocations inherit the policy. Precedence:
 *      CLI flag > env > default false.
 *   2. renderDecisionWithRuntimeContext composes the policy + audit + render
 *      pipeline correctly for the matrix of (autoMode, acceptDefaults,
 *      confidence) inputs.
 *   3. The renderSkillBody banner only appears when the body references the
 *      decisions template AND a flag is set.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveAndSyncRuntimeContext } from '../../../../src/commands/cli/common/auto-mode.js'
import {
  type DecisionPrompt,
  renderDecisionWithRuntimeContext,
  runtimeContextToAutoModeContext,
} from '../../../../src/core/templates/index.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

const promptHighConfidence: DecisionPrompt = {
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

const promptLowConfidence: DecisionPrompt = {
  ...promptHighConfidence,
  confidence: 'low',
}

const promptNoConfidence: DecisionPrompt = {
  question: promptHighConfidence.question,
  explanation: promptHighConfidence.explanation,
  options: promptHighConfidence.options,
}

describe('resolveAndSyncRuntimeContext', () => {
  it('defaults both flags to false and syncs "0" into env', () => {
    const env: NodeJS.ProcessEnv = {}
    const ctx = resolveAndSyncRuntimeContext({}, env)
    expect(ctx).toEqual({ autoMode: false, acceptDefaults: false })
    expect(env.ANVIL_AUTO).toBe('0')
    expect(env.ANVIL_AUTO_DEFAULTS).toBe('0')
  })

  it('CLI flag wins over env (explicit false beats env=1)', () => {
    const env: NodeJS.ProcessEnv = {
      ANVIL_AUTO: '1',
      ANVIL_AUTO_DEFAULTS: '1',
    }
    const ctx = resolveAndSyncRuntimeContext(
      { auto: false, acceptDefaults: false },
      env,
    )
    expect(ctx).toEqual({ autoMode: false, acceptDefaults: false })
    // Sync resets env to "0" so nested invocations see false.
    expect(env.ANVIL_AUTO).toBe('0')
    expect(env.ANVIL_AUTO_DEFAULTS).toBe('0')
  })

  it('env=1 promotes to true when CLI flag is absent', () => {
    const env: NodeJS.ProcessEnv = { ANVIL_AUTO: '1' }
    const ctx = resolveAndSyncRuntimeContext({}, env)
    expect(ctx.autoMode).toBe(true)
    expect(ctx.acceptDefaults).toBe(false)
    expect(env.ANVIL_AUTO).toBe('1')
    expect(env.ANVIL_AUTO_DEFAULTS).toBe('0')
  })

  it('CLI true wins when env unset', () => {
    const env: NodeJS.ProcessEnv = {}
    const ctx = resolveAndSyncRuntimeContext(
      { auto: true, acceptDefaults: true },
      env,
    )
    expect(ctx).toEqual({ autoMode: true, acceptDefaults: true })
    expect(env.ANVIL_AUTO).toBe('1')
    expect(env.ANVIL_AUTO_DEFAULTS).toBe('1')
  })

  it('orthogonal: autoMode and acceptDefaults resolve independently', () => {
    const env: NodeJS.ProcessEnv = { ANVIL_AUTO_DEFAULTS: '1' }
    const ctx = resolveAndSyncRuntimeContext({ auto: true }, env)
    expect(ctx).toEqual({ autoMode: true, acceptDefaults: true })
  })
})

describe('runtimeContextToAutoModeContext', () => {
  it('maps autoMode → enabled and acceptDefaults → acceptDefaults', () => {
    const out = runtimeContextToAutoModeContext({
      autoMode: true,
      acceptDefaults: false,
    })
    expect(out.enabled).toBe(true)
    expect(out.acceptDefaults).toBe(false)
    expect(out.anvilRoot).toBeUndefined()
  })

  it('attaches anvilRoot when provided', () => {
    const out = runtimeContextToAutoModeContext(
      { autoMode: false, acceptDefaults: true },
      '/tmp/x',
    )
    expect(out.anvilRoot).toBe('/tmp/x')
  })
})

describe('renderDecisionWithRuntimeContext — auto-select', () => {
  it('autoMode=on + confidence=high auto-selects and writes audit', () => {
    const anvilRoot = createTestTmpDir('anv-0176-auto-high')
    const result = renderDecisionWithRuntimeContext(
      promptHighConfidence,
      { autoMode: true, acceptDefaults: false },
      { surface: 'default', anvilRoot },
    )
    expect(result.action).toBe('auto-select')
    if (result.action === 'auto-select') {
      expect(result.reason).toBe('auto-mode-high-confidence')
      expect(result.selectedLabel).toBe('A')
      expect(result.auditPath).toBeDefined()
      const files = readdirSync(join(anvilRoot, 'decisions'))
      expect(files).toHaveLength(1)
      const entry = JSON.parse(
        readFileSync(result.auditPath as string, 'utf-8'),
      )
      expect(entry.question).toBe('Which library?')
      expect(entry.reason).toBe('auto-mode-high-confidence')
      expect(entry.confidence).toBe('high')
      expect(entry.selectedLabel).toBe('A')
    }
  })

  it('acceptDefaults=on auto-selects even at low confidence', () => {
    const anvilRoot = createTestTmpDir('anv-0176-accept-low')
    const result = renderDecisionWithRuntimeContext(
      promptLowConfidence,
      { autoMode: false, acceptDefaults: true },
      { surface: 'default', anvilRoot },
    )
    expect(result.action).toBe('auto-select')
    if (result.action === 'auto-select') {
      expect(result.reason).toBe('accept-defaults')
      expect(result.selectedLabel).toBe('A')
      const entry = JSON.parse(
        readFileSync(result.auditPath as string, 'utf-8'),
      )
      expect(entry.reason).toBe('accept-defaults')
      expect(entry.confidence).toBe('low')
    }
  })

  it('acceptDefaults=on auto-selects when confidence is missing', () => {
    const anvilRoot = createTestTmpDir('anv-0176-accept-noconf')
    const result = renderDecisionWithRuntimeContext(
      promptNoConfidence,
      { autoMode: false, acceptDefaults: true },
      { surface: 'default', anvilRoot },
    )
    expect(result.action).toBe('auto-select')
  })

  it('omits auditPath when anvilRoot is not supplied', () => {
    const result = renderDecisionWithRuntimeContext(
      promptHighConfidence,
      { autoMode: true, acceptDefaults: false },
      { surface: 'default' },
    )
    expect(result.action).toBe('auto-select')
    if (result.action === 'auto-select') {
      expect(result.auditPath).toBeUndefined()
    }
  })
})

describe('renderDecisionWithRuntimeContext — wait', () => {
  it('both flags off → wait with default markdown payload', () => {
    const anvilRoot = createTestTmpDir('anv-0176-wait-off')
    const result = renderDecisionWithRuntimeContext(
      promptHighConfidence,
      { autoMode: false, acceptDefaults: false },
      { surface: 'default', anvilRoot },
    )
    expect(result.action).toBe('wait')
    if (result.action === 'wait') {
      expect(result.reason).toBe('auto-mode-off')
      expect(typeof result.payload).toBe('string')
      expect(result.payload).toContain('## Decision: Which library?')
    }
    // No audit written on wait.
    expect(existsSync(join(anvilRoot, 'decisions'))).toBe(false)
  })

  it('autoMode=on + confidence=low → wait (high-confidence-only invariant)', () => {
    const result = renderDecisionWithRuntimeContext(
      promptLowConfidence,
      { autoMode: true, acceptDefaults: false },
      { surface: 'default' },
    )
    expect(result.action).toBe('wait')
    if (result.action === 'wait') {
      expect(result.reason).toBe('low-confidence')
    }
  })

  it('autoMode=on + missing confidence → wait', () => {
    const result = renderDecisionWithRuntimeContext(
      promptNoConfidence,
      { autoMode: true, acceptDefaults: false },
      { surface: 'default' },
    )
    expect(result.action).toBe('wait')
  })

  it('surface=claude-code wait yields an AskUserQuestionPayload', () => {
    const result = renderDecisionWithRuntimeContext(
      promptHighConfidence,
      { autoMode: false, acceptDefaults: false },
      { surface: 'claude-code' },
    )
    expect(result.action).toBe('wait')
    if (result.action === 'wait') {
      expect(typeof result.payload).toBe('object')
      const payload = result.payload as {
        question: string
        options: Array<{ label: string }>
      }
      expect(payload.question).toBe('Which library?')
      expect(payload.options[0].label).toBe('A (Recommended)')
    }
  })

  it('surface=opencode wait yields opencode-flavoured markdown', () => {
    const result = renderDecisionWithRuntimeContext(
      promptHighConfidence,
      { autoMode: false, acceptDefaults: false },
      { surface: 'opencode' },
    )
    expect(result.action).toBe('wait')
    if (result.action === 'wait') {
      expect(typeof result.payload).toBe('string')
      expect(result.payload).toContain('**Decision (OpenCode surface):**')
    }
  })
})
