import { describe, expect, it } from 'vitest'
import {
  type DecisionAutoModeOutcome,
  DecisionOption,
  type DecisionPrompt,
  DecisionPrompt as DecisionPromptSchema,
  renderDecisionClaudeCode,
  renderDecisionMarkdown,
  renderDecisionOpenCode,
  renderDecisionPrompt,
  resolveDecisionAutoMode,
} from '../../../src/core/templates/index.js'

const baseOptions = [
  { label: 'A', description: 'use library X' },
  { label: 'B', description: 'use library Y' },
]
const validPrompt: DecisionPrompt = {
  question: 'Which library should we adopt?',
  explanation: 'We need to pick before locking down the build pipeline.',
  options: [
    { ...baseOptions[0], recommended: true, rationale: 'X has better support' },
    baseOptions[1],
  ],
}

describe('DecisionPrompt schema', () => {
  it('parses a valid prompt with one recommended option', () => {
    const out = DecisionPromptSchema.parse(validPrompt)
    expect(out.options.find((o) => o.recommended === true)?.label).toBe('A')
  })

  it('parses a prompt with no recommendation', () => {
    const out = DecisionPromptSchema.parse({
      question: 'Q?',
      explanation: 'why',
      options: baseOptions,
    })
    expect(out.options.every((o) => o.recommended !== true)).toBe(true)
  })

  it('rejects an empty question', () => {
    expect(() =>
      DecisionPromptSchema.parse({ ...validPrompt, question: '' }),
    ).toThrow()
  })

  it('rejects an empty explanation', () => {
    expect(() =>
      DecisionPromptSchema.parse({ ...validPrompt, explanation: '' }),
    ).toThrow()
  })

  it('rejects fewer than 2 options', () => {
    expect(() =>
      DecisionPromptSchema.parse({
        question: 'Q?',
        explanation: 'why',
        options: [baseOptions[0]],
      }),
    ).toThrow()
  })

  it('rejects more than one recommended option', () => {
    expect(() =>
      DecisionPromptSchema.parse({
        question: 'Q?',
        explanation: 'why',
        options: [
          { ...baseOptions[0], recommended: true },
          { ...baseOptions[1], recommended: true },
        ],
      }),
    ).toThrow()
  })

  it('DecisionOption rejects empty label / description', () => {
    expect(() =>
      DecisionOption.parse({ label: '', description: 'x' }),
    ).toThrow()
    expect(() =>
      DecisionOption.parse({ label: 'A', description: '' }),
    ).toThrow()
  })

  it('accepts confidence values', () => {
    for (const confidence of ['low', 'medium', 'high'] as const) {
      const out = DecisionPromptSchema.parse({ ...validPrompt, confidence })
      expect(out.confidence).toBe(confidence)
    }
  })
})

describe('renderDecisionMarkdown', () => {
  it('renders question as a level-2 heading', () => {
    const out = renderDecisionMarkdown(validPrompt)
    expect(out.startsWith('## Decision: Which library should we adopt?')).toBe(
      true,
    )
  })

  it('marks the recommended option with (Recommended)', () => {
    const out = renderDecisionMarkdown(validPrompt)
    expect(out).toContain('**A** (Recommended) — use library X')
    expect(out).toContain('**B** — use library Y')
  })

  it('emits a Rationale line when the recommended option carries one', () => {
    const out = renderDecisionMarkdown(validPrompt)
    expect(out).toContain('**Rationale:** X has better support')
  })

  it('omits the Rationale line when no rationale is set', () => {
    const out = renderDecisionMarkdown({
      ...validPrompt,
      options: [{ ...baseOptions[0], recommended: true }, baseOptions[1]],
    })
    expect(out).not.toContain('**Rationale:**')
  })
})

describe('renderDecisionClaudeCode', () => {
  it('returns an AskUserQuestion-shaped payload', () => {
    const payload = renderDecisionClaudeCode(validPrompt)
    expect(payload.question).toBe('Which library should we adopt?')
    expect(payload.intro).toBe(
      'We need to pick before locking down the build pipeline.',
    )
    expect(payload.options).toHaveLength(2)
  })

  it('suffixes recommended labels with " (Recommended)"', () => {
    const payload = renderDecisionClaudeCode(validPrompt)
    expect(payload.options[0].label).toBe('A (Recommended)')
    expect(payload.options[1].label).toBe('B')
  })

  it('exposes _rationale when the recommended option has one', () => {
    const payload = renderDecisionClaudeCode(validPrompt)
    expect(payload._rationale).toBe('X has better support')
  })

  it('omits _rationale when the recommended option has none', () => {
    const payload = renderDecisionClaudeCode({
      ...validPrompt,
      options: [{ ...baseOptions[0], recommended: true }, baseOptions[1]],
    })
    expect(payload._rationale).toBeUndefined()
  })

  it('is JSON-serialisable', () => {
    const payload = renderDecisionClaudeCode(validPrompt)
    expect(() => JSON.stringify(payload)).not.toThrow()
  })
})

describe('renderDecisionOpenCode', () => {
  it('renders an opencode-flavoured block', () => {
    const out = renderDecisionOpenCode(validPrompt)
    expect(out).toContain('**Decision (OpenCode surface):**')
    expect(out).toContain('> Which library should we adopt?')
    expect(out).toContain('**Recommendation:** A')
    expect(out).toContain('**Reason:** X has better support')
  })

  it('omits Recommendation lines when no option is recommended', () => {
    const out = renderDecisionOpenCode({
      question: 'Q?',
      explanation: 'why',
      options: baseOptions,
    })
    expect(out).not.toContain('**Recommendation:**')
    expect(out).not.toContain('**Reason:**')
  })
})

describe('renderDecisionPrompt dispatch', () => {
  it('dispatches to the right surface', () => {
    expect(typeof renderDecisionPrompt(validPrompt, 'default')).toBe('string')
    expect(typeof renderDecisionPrompt(validPrompt, 'opencode')).toBe('string')
    const cc = renderDecisionPrompt(validPrompt, 'claude-code')
    expect(typeof cc).toBe('object')
  })
})

describe('resolveDecisionAutoMode', () => {
  function recommended(prompt = validPrompt): DecisionPrompt {
    return prompt
  }
  const noRec: DecisionPrompt = {
    question: 'Q?',
    explanation: 'why',
    options: baseOptions,
  }

  it('waits when auto-mode is off and no acceptDefaults', () => {
    const out = resolveDecisionAutoMode(recommended(), { enabled: false })
    expect(out.action).toBe('wait')
    if (out.action === 'wait') expect(out.reason).toBe('auto-mode-off')
  })

  it('waits when auto-mode is on but no recommendation', () => {
    const out = resolveDecisionAutoMode(noRec, { enabled: true })
    expect(out.action).toBe('wait')
  })

  it('waits when auto-mode is on but confidence is low', () => {
    const out = resolveDecisionAutoMode(
      { ...recommended(), confidence: 'low' },
      { enabled: true },
    )
    expect(out.action).toBe('wait')
    if (out.action === 'wait') expect(out.reason).toBe('low-confidence')
  })

  it('waits when auto-mode is on but confidence is medium', () => {
    const out = resolveDecisionAutoMode(
      { ...recommended(), confidence: 'medium' },
      { enabled: true },
    )
    expect(out.action).toBe('wait')
    if (out.action === 'wait') expect(out.reason).toBe('medium-confidence')
  })

  it('waits when auto-mode is on and recommendation exists but confidence is missing', () => {
    const out = resolveDecisionAutoMode(recommended(), { enabled: true })
    expect(out.action).toBe('wait')
    if (out.action === 'wait') expect(out.reason).toBe('low-confidence')
  })

  it('auto-selects when auto-mode is on and confidence is high', () => {
    const out: DecisionAutoModeOutcome = resolveDecisionAutoMode(
      { ...recommended(), confidence: 'high' },
      { enabled: true },
    )
    expect(out.action).toBe('auto-select')
    if (out.action === 'auto-select') {
      expect(out.reason).toBe('auto-mode-high-confidence')
      expect(out.selectedLabel).toBe('A')
    }
  })

  it('auto-selects when acceptDefaults is set regardless of confidence', () => {
    const out = resolveDecisionAutoMode(recommended(), {
      acceptDefaults: true,
    })
    expect(out.action).toBe('auto-select')
    if (out.action === 'auto-select') {
      expect(out.reason).toBe('accept-defaults')
    }
  })

  it('waits when acceptDefaults is set but no recommendation exists', () => {
    const out = resolveDecisionAutoMode(noRec, { acceptDefaults: true })
    expect(out.action).toBe('wait')
    if (out.action === 'wait') expect(out.reason).toBe('no-recommendation')
  })
})
