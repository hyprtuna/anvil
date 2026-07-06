/**
 * Plan 31 H2 — ANVIL_ROUTING_BANNER=off suppression integration test.
 *
 * Confirms the suppression knob exists and is wired correctly:
 * - ANVIL_ROUTING_BANNER=off → no `message` (stdout banner), but `systemInsert`
 *   still fires for directive-class prompts.
 * - Default (unset) → both `message` and `systemInsert` present for directives.
 */
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { userPromptSubmitHandler } from '../../../src/hooks/handlers/user-prompt-submit.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

/** A prompt that reliably hits the debug intent and produces a directive. */
const DIRECTIVE_PROMPT = 'debug this null pointer exception'

/** A vague prompt that should NOT produce a directive. */
const VAGUE_PROMPT = 'good morning'

let tmpDir: string

beforeEach(async () => {
  tmpDir = createTestTmpDir('h2-test')
  await mkdir(join(tmpDir, '.anvil'), { recursive: true })
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

function makeCtx(prompt: string, env: Record<string, string> = {}) {
  return {
    kind: 'user-prompt-submit' as const,
    cwd: tmpDir,
    config: buildDefaultConfig(),
    env,
    payload: prompt,
  }
}

describe('ANVIL_ROUTING_BANNER=off suppression (Plan 31 H2)', () => {
  it('ANVIL_ROUTING_BANNER=off: message is absent, systemInsert still fires for directive', async () => {
    const r = await userPromptSubmitHandler(
      makeCtx(DIRECTIVE_PROMPT, { ANVIL_ROUTING_BANNER: 'off' }),
    )
    expect(r.exitCode).toBe(0)
    // Banner (stdout) must be suppressed
    expect(r.message).toBeUndefined()
    // systemInsert (model-visible) must still be set — the suppression knob
    // only silences the user-facing stdout channel, not the model channel.
    expect(r.systemInsert).toBeDefined()
    expect(typeof r.systemInsert).toBe('string')
    expect((r.systemInsert as string).length).toBeGreaterThan(0)
  })

  it('ANVIL_ROUTING_BANNER=0: same behaviour — no message, systemInsert present', async () => {
    const r = await userPromptSubmitHandler(
      makeCtx(DIRECTIVE_PROMPT, { ANVIL_ROUTING_BANNER: '0' }),
    )
    expect(r.exitCode).toBe(0)
    expect(r.message).toBeUndefined()
    expect(r.systemInsert).toBeDefined()
  })

  it('ANVIL_ROUTING_BANNER=false: same behaviour — no message, systemInsert present', async () => {
    const r = await userPromptSubmitHandler(
      makeCtx(DIRECTIVE_PROMPT, { ANVIL_ROUTING_BANNER: 'false' }),
    )
    expect(r.exitCode).toBe(0)
    expect(r.message).toBeUndefined()
    expect(r.systemInsert).toBeDefined()
  })

  it('default (unset): both message and systemInsert present for directive-class prompt', async () => {
    const r = await userPromptSubmitHandler(makeCtx(DIRECTIVE_PROMPT))
    expect(r.exitCode).toBe(0)
    // message (stdout banner) is present by default
    expect(r.message).toBeDefined()
    expect((r.message as string).length).toBeGreaterThan(0)
    // systemInsert is also present for directives
    expect(r.systemInsert).toBeDefined()
  })

  it('vague prompt (non-directive): no systemInsert regardless of banner flag', async () => {
    const r = await userPromptSubmitHandler(
      makeCtx(VAGUE_PROMPT, { ANVIL_ROUTING_BANNER: 'off' }),
    )
    expect(r.exitCode).toBe(0)
    // vague prompt does not produce a directive → no systemInsert
    expect(r.systemInsert).toBeUndefined()
  })
})
