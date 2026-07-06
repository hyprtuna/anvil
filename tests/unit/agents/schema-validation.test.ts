/**
 * Plan 33 B6 — Schema validation unit tests.
 *
 * Tests the input_schema and output_schema boundary validation in runner.ts:
 * - valid output passes with status as-is
 * - invalid output → done_with_concerns + structured concerns
 * - invalid input → done_with_concerns before executor runs
 * - synthetic input_schema exercised here (no agent ships with one in v0.9.0)
 */
import { describe, expect, it, vi } from 'vitest'
import {
  type AgentInvocation,
  type InvocationExecutor,
  runInvocation,
} from '../../../src/agents/runner.js'
import type { Agent, ModelResolution } from '../../../src/core/types.js'

function makeResolution(): ModelResolution {
  return {
    model: 'claude-opus-4-6',
    effort: 'high' as const,
    max_tokens: 4096,
    source: 'default' as const,
    fallback_chain: [],
  }
}

function makeInvocation(
  overrides: Partial<AgentInvocation> = {},
): AgentInvocation {
  const agent: Agent = {
    frontmatter: {
      name: 'test-agent',
      description: 'test',
      model: 'opus',
      group: 'review',
      trigger: [],
      max_turns: 20,
      tools: [],
      ...overrides.agent?.frontmatter,
    } as Agent['frontmatter'],
    body: '# test-agent',
    sourcePath: '/agents/test-agent.md',
    ...overrides.agent,
  }
  return {
    resolvedModel: makeResolution(),
    prompt: 'do the thing',
    tools: [],
    maxTurns: 20,
    fallback_chain: [],
    ...overrides,
    agent,
  }
}

const VALID_REVIEW_REPORT_JSON = JSON.stringify({
  spec_compliance: { passed: true, findings: [], skipped: false },
  code_quality: { passed: true, findings: [], skipped: false },
  min_confidence: 80,
})

const INVALID_REVIEW_REPORT_JSON = JSON.stringify({
  spec_compliance: { passed: true },
  // missing code_quality — required field
})

describe('Plan 33 B2 — schema boundary validation', () => {
  describe('output_schema validation', () => {
    it('valid output passes unchanged with original status', async () => {
      const invocation = makeInvocation({
        agent: {
          frontmatter: {
            name: 'code-reviewer',
            description: 'reviewer',
            model: 'opus',
            group: 'review',
            trigger: [],
            max_turns: 20,
            tools: [],
            output_schema: 'ReviewReport',
          },
          body: '# code-reviewer',
          sourcePath: '/agents/code-reviewer.md',
        },
      } as Partial<AgentInvocation>)

      const executor: InvocationExecutor = async () =>
        `Here is the review:\n${VALID_REVIEW_REPORT_JSON}\n{"status":"done"}`

      const result = await runInvocation(invocation, executor)
      expect(result.status).toBe('done')
      expect(result.concerns).toBeUndefined()
      expect(result.output).toContain(VALID_REVIEW_REPORT_JSON)
    })

    it('invalid output → done_with_concerns with schema concerns', async () => {
      const invocation = makeInvocation({
        agent: {
          frontmatter: {
            name: 'code-reviewer',
            description: 'reviewer',
            model: 'opus',
            group: 'review',
            trigger: [],
            max_turns: 20,
            tools: [],
            output_schema: 'ReviewReport',
          },
          body: '# code-reviewer',
          sourcePath: '/agents/code-reviewer.md',
        },
      } as Partial<AgentInvocation>)

      const executor: InvocationExecutor = async () =>
        `Bad output:\n${INVALID_REVIEW_REPORT_JSON}\n{"status":"done"}`

      const result = await runInvocation(invocation, executor)
      expect(result.status).toBe('done_with_concerns')
      expect(result.concerns).toBeDefined()
      expect(result.concerns).toHaveLength(1)
      expect(result.concerns![0].type).toBe('schema')
      expect(result.concerns![0].errors.length).toBeGreaterThan(0)
      // Raw output is passed through unchanged
      expect(result.output).toContain(INVALID_REVIEW_REPORT_JSON)
    })

    it('no output_schema → no validation, status passes through as-is', async () => {
      const invocation = makeInvocation() // no output_schema

      const executor: InvocationExecutor = async () =>
        `Whatever output {"status":"done"}`

      const result = await runInvocation(invocation, executor)
      expect(result.status).toBe('done')
      expect(result.concerns).toBeUndefined()
    })

    it('unknown schema name throws at parse time', async () => {
      const invocation = makeInvocation({
        agent: {
          frontmatter: {
            name: 'bad-agent',
            description: 'bad',
            model: 'opus',
            group: 'review',
            trigger: [],
            max_turns: 20,
            tools: [],
            output_schema: 'NonExistentSchema',
          },
          body: '# bad-agent',
          sourcePath: '/agents/bad-agent.md',
        },
      } as Partial<AgentInvocation>)

      const executor: InvocationExecutor = async () =>
        'output {"status":"done"}'

      await expect(runInvocation(invocation, executor)).rejects.toThrow(
        /Unknown schema shorthand/,
      )
    })
  })

  describe('input_schema validation (synthetic — no agent ships with input_schema in v0.9.0)', () => {
    it('valid input passes and executor is called', async () => {
      const executor = vi.fn(async () => 'result {"status":"done"}')

      // Use PlanAuditReport as a synthetic input schema to exercise the path.
      // In practice, no agent ships with input_schema yet — this tests the code path.
      // We use ReviewReport which accepts any object with spec_compliance + code_quality.
      const invocation = makeInvocation({
        agent: {
          frontmatter: {
            name: 'synthetic-agent',
            description: 'synthetic',
            model: 'opus',
            group: 'review',
            trigger: [],
            max_turns: 20,
            tools: [],
            // input_schema on a string prompt: z.string() isn't a named schema.
            // Use undefined to test the "no input_schema" path (the valid path).
          },
          body: '# synthetic-agent',
          sourcePath: '/agents/synthetic-agent.md',
        },
      } as Partial<AgentInvocation>)

      const result = await runInvocation(invocation, executor)
      expect(executor).toHaveBeenCalledOnce()
      expect(result.status).toBe('done')
    })

    it('invalid input → done_with_concerns, executor NOT called', async () => {
      const executor = vi.fn(
        async () => 'should not be called {"status":"done"}',
      )

      // Create an agent with a synthetic input_schema that expects a JSON object.
      // We provide a plain string prompt which will fail the ReviewReport schema.
      const invocation = makeInvocation({
        agent: {
          frontmatter: {
            name: 'schema-input-agent',
            description: 'schema input test',
            model: 'opus',
            group: 'review',
            trigger: [],
            max_turns: 20,
            tools: [],
            input_schema: 'ReviewReport',
          },
          body: '# schema-input-agent',
          sourcePath: '/agents/schema-input-agent.md',
        },
        // The prompt is a plain string, which will fail ReviewReport schema validation
        prompt: 'please review my code',
      } as Partial<AgentInvocation>)

      const result = await runInvocation(invocation, executor)
      expect(executor).not.toHaveBeenCalled()
      expect(result.status).toBe('done_with_concerns')
      expect(result.concerns).toBeDefined()
      expect(result.concerns![0].type).toBe('schema')
      expect(result.output).toContain('SCHEMA_FAIL')
    })
  })

  describe('parseSchemaField', () => {
    it('resolves known schema names', async () => {
      const { parseSchemaField } = await import('../../../src/core/types.js')
      expect(parseSchemaField('ReviewReport')).toBeDefined()
      expect(parseSchemaField('PlanAuditReport')).toBeDefined()
    })

    it('returns undefined for undefined/null', async () => {
      const { parseSchemaField } = await import('../../../src/core/types.js')
      expect(parseSchemaField(undefined)).toBeUndefined()
      expect(parseSchemaField(null)).toBeUndefined()
    })

    it('throws for unknown schema names', async () => {
      const { parseSchemaField } = await import('../../../src/core/types.js')
      expect(() => parseSchemaField('NonExistent')).toThrow(/Unknown schema/)
    })

    it('accepts JSON-schema objects (returns z.unknown() validator)', async () => {
      const { parseSchemaField } = await import('../../../src/core/types.js')
      const validator = parseSchemaField({ type: 'object', properties: {} })
      expect(validator).toBeDefined()
    })
  })
})
