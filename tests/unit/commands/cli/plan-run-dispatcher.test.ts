/**
 * ANV-0175 Phase B — task dispatcher unit tests.
 *
 * Validates dispatcher resolution under different runtime/host combinations
 * and asserts the subprocess implementation surfaces stdout/stderr/exit-code
 * into a structured outcome. The spawn boundary is mocked end-to-end so the
 * tests never touch a real `claude` / `opencode` binary.
 */

import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import {
  type SpawnLike,
  buildDispatchPrompt,
  detectDispatchHost,
  resolveSubagentSlug,
  resolveTaskDispatcher,
} from '../../../../src/commands/cli/plan-run-dispatcher.js'
import type { PlanTask } from '../../../../src/core/plans/schema.js'

const FIXTURE_TASK: PlanTask = {
  id: 'A1',
  title: 'alpha',
  type: 'feature',
  effort: 's',
  depends_on: [],
  write_scope: [],
  verification: ['bun test tests/unit/foo.test.ts'],
  ticket: 'ANV-0175',
}

/**
 * Build a fake spawn impl. The fake returns a process emitter that scripts
 * the supplied lifecycle.
 */
function fakeSpawn(opts: {
  exitCode?: number | null
  stdout?: string
  stderr?: string
  emitError?: Error
  hang?: boolean
}): { spawn: SpawnLike; calls: Array<{ cmd: string; args: string[] }> } {
  const calls: Array<{ cmd: string; args: string[] }> = []
  const spawn: SpawnLike = (cmd, args) => {
    calls.push({ cmd, args: [...args] })
    const emitter = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter
      stderr: EventEmitter
      kill: (signal?: NodeJS.Signals) => void
    }
    emitter.stdout = new EventEmitter()
    emitter.stderr = new EventEmitter()
    emitter.kill = () => {
      /* noop in fake */
    }
    if (!opts.hang) {
      // Fire-and-forget — the handlers wire on(...) immediately.
      setImmediate(() => {
        if (opts.stdout !== undefined) {
          emitter.stdout.emit('data', Buffer.from(opts.stdout, 'utf-8'))
        }
        if (opts.stderr !== undefined) {
          emitter.stderr.emit('data', Buffer.from(opts.stderr, 'utf-8'))
        }
        if (opts.emitError !== undefined) {
          emitter.emit('error', opts.emitError)
        } else {
          emitter.emit('exit', opts.exitCode ?? 0)
        }
      })
    }
    return emitter as unknown as ReturnType<SpawnLike>
  }
  return { spawn, calls }
}

describe('resolveTaskDispatcher — no-op cases', () => {
  it('returns a no-op success when autoMode is false', async () => {
    const dispatcher = resolveTaskDispatcher({
      runtime: { autoMode: false, acceptDefaults: false },
    })
    const out = await dispatcher({ task: FIXTURE_TASK })
    expect(out.outcome).toBe('success')
  })

  it('returns a no-op success when host is none', async () => {
    const dispatcher = resolveTaskDispatcher({
      runtime: { autoMode: true, acceptDefaults: false },
      host: 'none',
    })
    const out = await dispatcher({ task: FIXTURE_TASK })
    expect(out.outcome).toBe('success')
  })

  it('respects forceNoop even when autoMode is true', async () => {
    const { spawn, calls } = fakeSpawn({ exitCode: 0 })
    const dispatcher = resolveTaskDispatcher({
      runtime: { autoMode: true, acceptDefaults: false },
      host: 'claude-code',
      hostBinary: 'claude',
      spawnImpl: spawn,
      forceNoop: true,
    })
    const out = await dispatcher({ task: FIXTURE_TASK })
    expect(out.outcome).toBe('success')
    expect(calls).toHaveLength(0)
  })
})

describe('resolveTaskDispatcher — subprocess success/failure', () => {
  it('returns success on exit code 0 and invokes the host binary', async () => {
    const { spawn, calls } = fakeSpawn({ exitCode: 0, stdout: 'ok' })
    const dispatcher = resolveTaskDispatcher({
      runtime: { autoMode: true, acceptDefaults: false },
      host: 'claude-code',
      hostBinary: 'claude',
      spawnImpl: spawn,
      planRunDir: '/tmp/runs/r1',
      planRunId: 'r1',
    })
    const out = await dispatcher({ task: FIXTURE_TASK })
    expect(out.outcome).toBe('success')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.cmd).toBe('claude')
    expect(calls[0]?.args[0]).toBe('--print')
    const prompt = calls[0]?.args[1] ?? ''
    expect(prompt).toContain('anvil:ultra-worker')
    expect(prompt).toContain('A1')
    expect(prompt).toContain('ANV-0175')
  })

  it('returns failed with stderr message on non-zero exit', async () => {
    const { spawn } = fakeSpawn({ exitCode: 7, stderr: 'agent crashed' })
    const dispatcher = resolveTaskDispatcher({
      runtime: { autoMode: true, acceptDefaults: false },
      host: 'claude-code',
      hostBinary: 'claude',
      spawnImpl: spawn,
    })
    const out = await dispatcher({ task: FIXTURE_TASK })
    expect(out.outcome).toBe('failed')
    expect(out.error?.message).toContain('exited 7')
    expect(out.error?.message).toContain('agent crashed')
  })

  it('returns failed (deterministic) on spawn error', async () => {
    const { spawn } = fakeSpawn({ emitError: new Error('ENOENT') })
    const dispatcher = resolveTaskDispatcher({
      runtime: { autoMode: true, acceptDefaults: false },
      host: 'claude-code',
      hostBinary: 'claude',
      spawnImpl: spawn,
    })
    const out = await dispatcher({ task: FIXTURE_TASK })
    expect(out.outcome).toBe('failed')
    expect(out.error?.classification).toBe('deterministic')
    expect(out.error?.message).toContain('ENOENT')
  })

  it('returns failed (transient) on timeout', async () => {
    const { spawn } = fakeSpawn({ hang: true })
    const dispatcher = resolveTaskDispatcher({
      runtime: { autoMode: true, acceptDefaults: false },
      host: 'claude-code',
      hostBinary: 'claude',
      spawnImpl: spawn,
      timeoutMs: 50,
    })
    const out = await dispatcher({ task: FIXTURE_TASK })
    expect(out.outcome).toBe('failed')
    expect(out.error?.classification).toBe('transient')
    expect(out.error?.message).toContain('timed out')
  })

  it('uses opencode "run --print" args when host is opencode', async () => {
    const { spawn, calls } = fakeSpawn({ exitCode: 0 })
    const dispatcher = resolveTaskDispatcher({
      runtime: { autoMode: true, acceptDefaults: false },
      host: 'opencode',
      hostBinary: 'opencode',
      spawnImpl: spawn,
    })
    await dispatcher({ task: FIXTURE_TASK })
    expect(calls[0]?.cmd).toBe('opencode')
    expect(calls[0]?.args[0]).toBe('run')
    expect(calls[0]?.args[1]).toBe('--print')
  })
})

describe('detectDispatchHost', () => {
  it('honors ANVIL_DISPATCH_HOST override', () => {
    expect(detectDispatchHost({ ANVIL_DISPATCH_HOST: 'claude-code' })).toBe(
      'claude-code',
    )
    expect(detectDispatchHost({ ANVIL_DISPATCH_HOST: 'opencode' })).toBe(
      'opencode',
    )
    expect(detectDispatchHost({ ANVIL_DISPATCH_HOST: 'none' })).toBe('none')
  })

  it('returns claude-code when CLAUDE_CODE=1', () => {
    expect(detectDispatchHost({ CLAUDE_CODE: '1' })).toBe('claude-code')
  })

  it('returns opencode when OPENCODE=1', () => {
    expect(detectDispatchHost({ OPENCODE: '1' })).toBe('opencode')
  })

  it('returns none on a clean env', () => {
    expect(detectDispatchHost({})).toBe('none')
  })
})

describe('resolveSubagentSlug', () => {
  it('falls back to anvil:ultra-worker by default', () => {
    expect(resolveSubagentSlug(FIXTURE_TASK, {})).toBe('anvil:ultra-worker')
  })

  it('honors ANVIL_DISPATCH_DEFAULT_AGENT override', () => {
    expect(
      resolveSubagentSlug(FIXTURE_TASK, {
        ANVIL_DISPATCH_DEFAULT_AGENT: 'anvil:code-reviewer',
      }),
    ).toBe('anvil:code-reviewer')
  })
})

describe('buildDispatchPrompt', () => {
  it('includes task identifiers and verification commands', () => {
    const prompt = buildDispatchPrompt(FIXTURE_TASK, {
      planRunId: 'r1',
      planRunDir: '/tmp/r1',
    })
    expect(prompt).toContain('A1 — alpha')
    expect(prompt).toContain('feature')
    expect(prompt).toContain('Ticket: ANV-0175')
    expect(prompt).toContain('bun test tests/unit/foo.test.ts')
    expect(prompt).toContain('Plan run id: r1')
    expect(prompt).toContain('Plan run dir: /tmp/r1')
  })
})
