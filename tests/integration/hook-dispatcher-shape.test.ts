/**
 * Plan 33 J4 — Hook dispatcher shape contract test.
 *
 * For every registered hook kind, builds a synthetic HookContext and invokes
 * the handler directly (not through the full dispatcher pipeline). Asserts that
 * the result passes HookResult.parse(). This is a CLASS-WIDE regression guard:
 * if any handler returns an invalid shape, this test fails loudly.
 *
 * This test does NOT spawn child processes or touch real disk installs.
 * All handlers are invoked with minimal synthetic contexts.
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../src/core/config/defaults.js'
import { HookResult } from '../../src/core/types.js'
import { contextMonitorHandler } from '../../src/hooks/handlers/context-monitor.js'
import { notificationHandler } from '../../src/hooks/handlers/notification.js'
import { onErrorHandler } from '../../src/hooks/handlers/on-error.js'
import { onLargeOutputHandler } from '../../src/hooks/handlers/on-large-output.js'
import { onPrOpenHandler } from '../../src/hooks/handlers/on-pr-open.js'
import { phaseBoundaryHandler } from '../../src/hooks/handlers/phase-boundary.js'
import { postEditHandler } from '../../src/hooks/handlers/post-edit.js'
import { postTestRunHandler } from '../../src/hooks/handlers/post-test-run.js'
import { postToolUseHandler } from '../../src/hooks/handlers/post-tool-use.js'
import { preCompactSnapshotHandler } from '../../src/hooks/handlers/pre-compact.js'
import { promptGuardHandler } from '../../src/hooks/handlers/prompt-guard.js'
import {
  readGuardHandler,
  resetReadCounts,
} from '../../src/hooks/handlers/read-guard.js'
import {
  rulesPromptInjectorSessionStart,
  rulesPromptInjectorUserPromptSubmit,
} from '../../src/hooks/handlers/rules-prompt-injector.js'
import { sessionEndHandler } from '../../src/hooks/handlers/session-end.js'
import { sessionStartHandler } from '../../src/hooks/handlers/session-start.js'
import { stopHandler } from '../../src/hooks/handlers/stop.js'
import { subagentStopHandler } from '../../src/hooks/handlers/subagent-stop.js'
import { userPromptSubmitHandler } from '../../src/hooks/handlers/user-prompt-submit.js'
import { workflowGuardHandler } from '../../src/hooks/handlers/workflow-guard.js'

const TMP = tmpdir()
const config = buildDefaultConfig()

function baseCtx(kind: string, payload: unknown = null) {
  return {
    kind: kind as Parameters<typeof HookResult.parse>[0] extends {
      kind: infer K
    }
      ? K
      : never,
    cwd: TMP,
    config,
    env: { HOME: TMP, PATH: process.env.PATH ?? '' },
    payload,
  }
}

// Helper: invoke handler and assert HookResult shape is valid
async function assertShape(
  name: string,
  handler: (ctx: ReturnType<typeof baseCtx>) => Promise<unknown>,
  ctx: ReturnType<typeof baseCtx>,
) {
  const result = await handler(ctx as Parameters<typeof handler>[0])
  expect(
    () => HookResult.parse(result),
    `Handler "${name}" returned an invalid HookResult shape`,
  ).not.toThrow()
}

describe('hook-dispatcher-shape — every handler returns a valid HookResult', () => {
  it('session-start handler', async () => {
    await assertShape(
      'session-start',
      sessionStartHandler,
      baseCtx('session-start') as Parameters<typeof sessionStartHandler>[0],
    )
  })

  it('user-prompt-submit handler (non-directive prompt)', async () => {
    await assertShape(
      'user-prompt-submit',
      userPromptSubmitHandler,
      baseCtx('user-prompt-submit', 'update the docs') as Parameters<
        typeof userPromptSubmitHandler
      >[0],
    )
  })

  it('user-prompt-submit handler (directive prompt — sets systemInsert)', async () => {
    // J1 reproduction: after a quiet period, a high-confidence prompt triggers systemInsert
    await assertShape(
      'user-prompt-submit (directive)',
      userPromptSubmitHandler,
      baseCtx(
        'user-prompt-submit',
        'debug this null pointer exception',
      ) as Parameters<typeof userPromptSubmitHandler>[0],
    )
  })

  it('user-prompt-submit handler (empty prompt)', async () => {
    await assertShape(
      'user-prompt-submit (empty)',
      userPromptSubmitHandler,
      baseCtx('user-prompt-submit', '') as Parameters<
        typeof userPromptSubmitHandler
      >[0],
    )
  })

  it('user-prompt-submit handler (object payload — real CC shape)', async () => {
    const ctx = baseCtx('user-prompt-submit', {
      prompt: 'debug this null pointer exception',
      session_id: 'test-session',
      cwd: TMP,
      hook_event_name: 'UserPromptSubmit',
      transcript_path: join(TMP, 'transcript.txt'),
    }) as Parameters<typeof userPromptSubmitHandler>[0]
    await assertShape(
      'user-prompt-submit (CC object payload)',
      userPromptSubmitHandler,
      ctx,
    )
  })

  it('pre-commit handler', async () => {
    // typecheck will fail in /tmp but the handler should still return valid HookResult
    await assertShape(
      'pre-commit',
      async (ctx) => {
        const { preCommitHandler } = await import(
          '../../src/hooks/handlers/pre-commit.js'
        )
        return preCommitHandler(ctx as Parameters<typeof preCommitHandler>[0])
      },
      baseCtx('pre-commit') as Parameters<typeof sessionStartHandler>[0],
    )
  })

  it('post-edit handler', async () => {
    await assertShape(
      'post-edit',
      postEditHandler,
      baseCtx('post-edit', {
        file: 'src/app.ts',
        content: 'const x = 1',
      }) as Parameters<typeof postEditHandler>[0],
    )
  })

  it('on-error handler', async () => {
    await assertShape(
      'on-error',
      onErrorHandler,
      baseCtx('on-error', { error: 'test error' }) as Parameters<
        typeof onErrorHandler
      >[0],
    )
  })

  it('on-pr-open handler', async () => {
    await assertShape(
      'on-pr-open',
      onPrOpenHandler,
      baseCtx('on-pr-open', { prNumber: 1, branch: 'main' }) as Parameters<
        typeof onPrOpenHandler
      >[0],
    )
  })

  it('post-tool-use handler', async () => {
    await assertShape(
      'post-tool-use',
      postToolUseHandler,
      baseCtx('post-tool-use', {
        tool: 'Read',
        result: 'file content',
      }) as Parameters<typeof postToolUseHandler>[0],
    )
  })

  it('post-test-run handler', async () => {
    await assertShape(
      'post-test-run',
      postTestRunHandler,
      baseCtx('post-test-run', { passed: 5, failed: 0 }) as Parameters<
        typeof postTestRunHandler
      >[0],
    )
  })

  it('context-monitor handler', async () => {
    await assertShape(
      'context-monitor',
      contextMonitorHandler,
      baseCtx('context-monitor', {
        contextTokens: 50000,
        contextLimit: 200000,
      }) as Parameters<typeof contextMonitorHandler>[0],
    )
  })

  it('prompt-guard handler', async () => {
    await assertShape(
      'prompt-guard',
      promptGuardHandler,
      baseCtx('prompt-guard', {
        filePath: 'skills/test.md',
        content: 'normal content',
      }) as Parameters<typeof promptGuardHandler>[0],
    )
  })

  it('phase-boundary handler', async () => {
    await assertShape(
      'phase-boundary',
      phaseBoundaryHandler,
      baseCtx('phase-boundary', { filePath: 'src/app.ts' }) as Parameters<
        typeof phaseBoundaryHandler
      >[0],
    )
  })

  it('read-guard handler', async () => {
    resetReadCounts()
    await assertShape(
      'read-guard',
      readGuardHandler,
      baseCtx('read-guard', { filePath: '/tmp/test.ts' }) as Parameters<
        typeof readGuardHandler
      >[0],
    )
  })

  it('workflow-guard handler', async () => {
    await assertShape(
      'workflow-guard',
      workflowGuardHandler,
      baseCtx('workflow-guard', { filePath: 'README.md' }) as Parameters<
        typeof workflowGuardHandler
      >[0],
    )
  })

  it('session-end handler', async () => {
    await assertShape(
      'session-end',
      sessionEndHandler,
      baseCtx('session-end', {
        filesModified: [],
        commitsCreated: 0,
      }) as Parameters<typeof sessionEndHandler>[0],
    )
  })

  it('pre-compact handler', async () => {
    await assertShape(
      'pre-compact',
      preCompactSnapshotHandler,
      baseCtx('pre-compact', {}) as Parameters<
        typeof preCompactSnapshotHandler
      >[0],
    )
  })

  it('rules-prompt-injector session-start handler', async () => {
    await assertShape(
      'rules-prompt-injector:session-start',
      rulesPromptInjectorSessionStart,
      baseCtx('session-start') as Parameters<
        typeof rulesPromptInjectorSessionStart
      >[0],
    )
  })

  it('rules-prompt-injector user-prompt-submit handler', async () => {
    await assertShape(
      'rules-prompt-injector:user-prompt-submit',
      rulesPromptInjectorUserPromptSubmit,
      baseCtx('user-prompt-submit', 'test prompt') as Parameters<
        typeof rulesPromptInjectorUserPromptSubmit
      >[0],
    )
  })

  it('notification handler', async () => {
    await assertShape(
      'notification',
      notificationHandler,
      baseCtx('notification') as Parameters<typeof notificationHandler>[0],
    )
  })

  it('stop handler', async () => {
    await assertShape(
      'stop',
      stopHandler,
      baseCtx('stop') as Parameters<typeof stopHandler>[0],
    )
  })

  it('subagent-stop handler', async () => {
    await assertShape(
      'subagent-stop',
      subagentStopHandler,
      baseCtx('subagent-stop') as Parameters<typeof subagentStopHandler>[0],
    )
  })

  it('on-large-output stub handler', async () => {
    await assertShape(
      'on-large-output',
      onLargeOutputHandler,
      baseCtx('on-large-output') as Parameters<typeof onLargeOutputHandler>[0],
    )
  })
})
