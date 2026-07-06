/**
 * Plan 33 B6 — Output schema roundtrip integration tests.
 *
 * For each of the four adopted agents (code-reviewer, plan-verifier,
 * spec-reviewer, code-quality-reviewer):
 *   1. Per-agent self-test gate: assert the agent's CURRENT declared schema
 *      passes on a representative output fixture. If this fails, the schema
 *      does not match the emission contract — fix or remove from B3.
 *   2. Feed a valid fixture → runner returns it unchanged with no concerns.
 *   3. Feed a fixture missing a required field → concerns: [{type: 'schema', errors: [...]}].
 */
import { describe, expect, it } from 'vitest'
import {
  type AgentInvocation,
  type InvocationExecutor,
  runInvocation,
} from '../../src/agents/runner.js'
import { parseSchemaField } from '../../src/core/types.js'
import type { Agent, ModelResolution } from '../../src/core/types.js'

// ─── Fixtures ───────────────────────────────────────────────────────────────

const VALID_REVIEW_REPORT = {
  spec_compliance: {
    passed: true,
    findings: [
      {
        review_type: 'spec-compliance',
        severity: 'suggestion',
        confidence: 85,
        file: 'src/foo.ts',
        category: 'convention',
        message: 'Consider using named exports',
      },
    ],
    skipped: false,
  },
  code_quality: { passed: true, findings: [], skipped: false },
  min_confidence: 80,
}

const INVALID_REVIEW_REPORT = {
  spec_compliance: { passed: true },
  // missing code_quality (required)
}

const VALID_PLAN_AUDIT_REPORT = {
  verdict: 'pass',
  plan_path: '.anvil/_archive/docs-anvil/plans/plan-33.md',
  spec_path: '.anvil/_archive/docs-anvil/specs/deep-upgrade-master.md',
  gaps: [],
  requirements_total: 10,
  requirements_covered: 10,
}

const INVALID_PLAN_AUDIT_REPORT = {
  verdict: 'pass',
  // missing plan_path (required)
  gaps: [],
  requirements_total: 5,
  requirements_covered: 5,
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeResolution(): ModelResolution {
  return {
    model: 'claude-opus-4-6',
    effort: 'high' as const,
    max_tokens: 4096,
    source: 'default' as const,
    fallback_chain: [],
  }
}

function makeInvocationForAgent(
  agentName: string,
  outputSchema: string,
  prompt = 'review this',
): AgentInvocation {
  const agent: Agent = {
    frontmatter: {
      name: agentName,
      description: agentName,
      model: 'opus',
      group: 'review',
      trigger: [],
      max_turns: 20,
      tools: [],
      output_schema: outputSchema,
    } as Agent['frontmatter'],
    body: `# ${agentName}`,
    sourcePath: `/agents/${agentName}.md`,
  }
  return {
    agent,
    resolvedModel: makeResolution(),
    prompt,
    tools: [],
    maxTurns: 20,
    fallback_chain: [],
  }
}

function makeExecutor(fixture: unknown, status = 'done'): InvocationExecutor {
  return async () =>
    `Agent output:\n${JSON.stringify(fixture)}\n{"status":"${status}"}`
}

// ─── Per-agent self-test gate (B3 acceptance criterion #7) ──────────────────

describe('Per-agent self-test gate — declared schemas match emission contracts', () => {
  it('code-reviewer: ReviewReport schema validates representative output', () => {
    const schema = parseSchemaField('ReviewReport')
    expect(schema).toBeDefined()
    const result = schema!.safeParse(VALID_REVIEW_REPORT)
    expect(result.success).toBe(true)
  })

  it('spec-reviewer: ReviewReport schema validates representative output (review_type: spec-compliance)', () => {
    const schema = parseSchemaField('ReviewReport')
    expect(schema).toBeDefined()
    const fixture = {
      ...VALID_REVIEW_REPORT,
      spec_compliance: {
        ...VALID_REVIEW_REPORT.spec_compliance,
        findings: [
          {
            ...VALID_REVIEW_REPORT.spec_compliance.findings[0],
            review_type: 'spec-compliance',
          },
        ],
      },
    }
    const result = schema!.safeParse(fixture)
    expect(result.success).toBe(true)
  })

  it('code-quality-reviewer: ReviewReport schema validates representative output (review_type: code-quality)', () => {
    const schema = parseSchemaField('ReviewReport')
    expect(schema).toBeDefined()
    const fixture = {
      spec_compliance: { passed: true, findings: [], skipped: true },
      code_quality: {
        passed: false,
        findings: [
          {
            review_type: 'code-quality',
            severity: 'important',
            confidence: 90,
            file: 'src/bar.ts',
            line: 42,
            category: 'bug',
            message: 'Null dereference possible',
            fix: 'Add null check before access',
          },
        ],
        skipped: false,
      },
      min_confidence: 80,
    }
    const result = schema!.safeParse(fixture)
    expect(result.success).toBe(true)
  })

  it('plan-verifier: PlanAuditReport schema validates representative output', () => {
    const schema = parseSchemaField('PlanAuditReport')
    expect(schema).toBeDefined()
    const result = schema!.safeParse(VALID_PLAN_AUDIT_REPORT)
    expect(result.success).toBe(true)
  })
})

// ─── Runner roundtrip: code-reviewer ────────────────────────────────────────

describe('code-reviewer output_schema roundtrip', () => {
  it('valid ReviewReport output → no concerns, status preserved', async () => {
    const invocation = makeInvocationForAgent('code-reviewer', 'ReviewReport')
    const result = await runInvocation(
      invocation,
      makeExecutor(VALID_REVIEW_REPORT),
    )
    expect(result.status).toBe('done')
    expect(result.concerns).toBeUndefined()
  })

  it('invalid ReviewReport output → concerns with schema errors', async () => {
    const invocation = makeInvocationForAgent('code-reviewer', 'ReviewReport')
    const result = await runInvocation(
      invocation,
      makeExecutor(INVALID_REVIEW_REPORT),
    )
    expect(result.status).toBe('done_with_concerns')
    expect(result.concerns).toBeDefined()
    expect(result.concerns![0]).toMatchObject({
      type: 'schema',
      errors: expect.arrayContaining([expect.stringContaining('code_quality')]),
    })
  })
})

// ─── Runner roundtrip: plan-verifier ────────────────────────────────────────

describe('plan-verifier output_schema roundtrip', () => {
  it('valid PlanAuditReport output → no concerns, status preserved', async () => {
    const invocation = makeInvocationForAgent(
      'plan-verifier',
      'PlanAuditReport',
    )
    const result = await runInvocation(
      invocation,
      makeExecutor(VALID_PLAN_AUDIT_REPORT),
    )
    expect(result.status).toBe('done')
    expect(result.concerns).toBeUndefined()
  })

  it('invalid PlanAuditReport output → concerns with schema errors', async () => {
    const invocation = makeInvocationForAgent(
      'plan-verifier',
      'PlanAuditReport',
    )
    const result = await runInvocation(
      invocation,
      makeExecutor(INVALID_PLAN_AUDIT_REPORT),
    )
    expect(result.status).toBe('done_with_concerns')
    expect(result.concerns).toBeDefined()
    expect(result.concerns![0]).toMatchObject({
      type: 'schema',
      errors: expect.arrayContaining([expect.stringContaining('plan_path')]),
    })
  })
})

// ─── Runner roundtrip: spec-reviewer ────────────────────────────────────────

describe('spec-reviewer output_schema roundtrip', () => {
  it('valid ReviewReport output → no concerns, status preserved', async () => {
    const invocation = makeInvocationForAgent('spec-reviewer', 'ReviewReport')
    const result = await runInvocation(
      invocation,
      makeExecutor(VALID_REVIEW_REPORT),
    )
    expect(result.status).toBe('done')
    expect(result.concerns).toBeUndefined()
  })

  it('invalid ReviewReport output → concerns with schema errors', async () => {
    const invocation = makeInvocationForAgent('spec-reviewer', 'ReviewReport')
    const result = await runInvocation(
      invocation,
      makeExecutor(INVALID_REVIEW_REPORT),
    )
    expect(result.status).toBe('done_with_concerns')
    expect(result.concerns).toBeDefined()
    expect(result.concerns![0].type).toBe('schema')
  })
})

// ─── Runner roundtrip: code-quality-reviewer ────────────────────────────────

describe('code-quality-reviewer output_schema roundtrip', () => {
  it('valid ReviewReport output → no concerns, status preserved', async () => {
    const invocation = makeInvocationForAgent(
      'code-quality-reviewer',
      'ReviewReport',
    )
    const result = await runInvocation(
      invocation,
      makeExecutor(VALID_REVIEW_REPORT),
    )
    expect(result.status).toBe('done')
    expect(result.concerns).toBeUndefined()
  })

  it('invalid ReviewReport output → concerns with schema errors', async () => {
    const invocation = makeInvocationForAgent(
      'code-quality-reviewer',
      'ReviewReport',
    )
    const result = await runInvocation(
      invocation,
      makeExecutor(INVALID_REVIEW_REPORT),
    )
    expect(result.status).toBe('done_with_concerns')
    expect(result.concerns).toBeDefined()
    expect(result.concerns![0].type).toBe('schema')
  })
})
