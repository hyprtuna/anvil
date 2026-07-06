import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import {
  AfterPayload,
  BeforePayload,
  buildAfterPayload,
  buildBeforePayload,
} from '../../../src/opencode-plugin/hooks/payload.js'

const VALID_BEFORE_INPUT = {
  tool: 'bash',
  sessionID: 'sess-001',
  callID: 'call-001',
}
const VALID_BEFORE_OUTPUT = {
  args: { command: 'ls' },
}
const VALID_AFTER_OUTPUT = {
  title: 'bash result',
  output: 'file1.txt\nfile2.txt',
  metadata: {},
}

describe('BeforePayload schema', () => {
  it('parses a valid before payload', () => {
    const payload = BeforePayload.parse({
      kind: 'pre-tool-use',
      surface: 'opencode',
      cwd: '/some/dir',
      env: { HOME: '/home/user' },
      payload: {
        sessionID: 'sess-001',
        callID: 'call-001',
        tool: 'bash',
        args: { command: 'ls' },
      },
    })
    expect(payload.kind).toBe('pre-tool-use')
    expect(payload.surface).toBe('opencode')
    expect(payload.payload.tool).toBe('bash')
  })

  it('rejects non-string tool', () => {
    expect(() =>
      BeforePayload.parse({
        kind: 'pre-tool-use',
        surface: 'opencode',
        cwd: '/some/dir',
        env: {},
        payload: {
          sessionID: 'sess-001',
          callID: 'call-001',
          tool: 123, // invalid
          args: {},
        },
      }),
    ).toThrow(ZodError)
  })

  it('rejects empty string tool', () => {
    expect(() =>
      BeforePayload.parse({
        kind: 'pre-tool-use',
        surface: 'opencode',
        cwd: '/some/dir',
        env: {},
        payload: {
          sessionID: 'sess-001',
          callID: 'call-001',
          tool: '', // invalid
          args: {},
        },
      }),
    ).toThrow(ZodError)
  })

  it('rejects missing sessionID', () => {
    expect(() =>
      BeforePayload.parse({
        kind: 'pre-tool-use',
        surface: 'opencode',
        cwd: '/dir',
        env: {},
        payload: {
          // sessionID missing
          callID: 'call-001',
          tool: 'bash',
          args: {},
        },
      }),
    ).toThrow(ZodError)
  })

  it('rejects invalid surface value', () => {
    expect(() =>
      BeforePayload.parse({
        kind: 'pre-tool-use',
        surface: 'claude-code', // invalid — must be 'opencode'
        cwd: '/dir',
        env: {},
        payload: {
          sessionID: 'sess-001',
          callID: 'call-001',
          tool: 'bash',
          args: {},
        },
      }),
    ).toThrow(ZodError)
  })

  it('rejects invalid HookKind', () => {
    expect(() =>
      BeforePayload.parse({
        kind: 'not-a-real-hook', // invalid
        surface: 'opencode',
        cwd: '/dir',
        env: {},
        payload: {
          sessionID: 'sess-001',
          callID: 'call-001',
          tool: 'bash',
          args: {},
        },
      }),
    ).toThrow(ZodError)
  })
})

describe('AfterPayload schema', () => {
  it('parses a valid after payload', () => {
    const payload = AfterPayload.parse({
      kind: 'post-tool-use',
      surface: 'opencode',
      cwd: '/dir',
      env: {},
      payload: {
        sessionID: 'sess-001',
        callID: 'call-001',
        tool: 'bash',
        args: {},
        output: 'result text',
        durationMs: 150,
      },
    })
    expect(payload.payload.output).toBe('result text')
    expect(payload.payload.durationMs).toBe(150)
  })

  it('accepts optional error field', () => {
    const payload = AfterPayload.parse({
      kind: 'on-error',
      surface: 'opencode',
      cwd: '/dir',
      env: {},
      payload: {
        sessionID: 'sess-001',
        callID: 'call-001',
        tool: 'bash',
        args: {},
        output: '',
        error: 'command not found',
        durationMs: 10,
      },
    })
    expect(payload.payload.error).toBe('command not found')
  })

  it('rejects missing durationMs', () => {
    expect(() =>
      AfterPayload.parse({
        kind: 'post-tool-use',
        surface: 'opencode',
        cwd: '/dir',
        env: {},
        payload: {
          sessionID: 'sess-001',
          callID: 'call-001',
          tool: 'bash',
          args: {},
          output: 'result',
          // durationMs missing
        },
      }),
    ).toThrow(ZodError)
  })
})

describe('buildBeforePayload', () => {
  it('builds a valid payload from OC before handler args', () => {
    const result = buildBeforePayload(
      'pre-tool-use',
      VALID_BEFORE_INPUT,
      VALID_BEFORE_OUTPUT,
      '/project',
    )
    expect(result.kind).toBe('pre-tool-use')
    expect(result.surface).toBe('opencode')
    expect(result.cwd).toBe('/project')
    expect(result.payload.tool).toBe('bash')
    expect(result.payload.sessionID).toBe('sess-001')
    expect(result.payload.args).toEqual({ command: 'ls' })
  })

  it('throws ZodError when tool is not a string', () => {
    expect(() =>
      buildBeforePayload(
        'pre-tool-use',
        { ...VALID_BEFORE_INPUT, tool: '' },
        VALID_BEFORE_OUTPUT,
        '/project',
      ),
    ).toThrow(ZodError)
  })
})

describe('buildAfterPayload', () => {
  it('builds a valid after payload', () => {
    const result = buildAfterPayload(
      'post-tool-use',
      VALID_BEFORE_INPUT,
      VALID_AFTER_OUTPUT,
      '/project',
      200,
    )
    expect(result.kind).toBe('post-tool-use')
    expect(result.payload.output).toBe('file1.txt\nfile2.txt')
    expect(result.payload.durationMs).toBe(200)
  })

  it('throws ZodError when tool is empty string', () => {
    expect(() =>
      buildAfterPayload(
        'post-tool-use',
        { ...VALID_BEFORE_INPUT, tool: '' },
        VALID_AFTER_OUTPUT,
        '/project',
        100,
      ),
    ).toThrow(ZodError)
  })
})
