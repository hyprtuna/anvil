/**
 * Plan 31 H5 — adapter parity test for systemInsert payload.
 *
 * Both adapters must deliver the same `systemInsert` payload to the model,
 * even though the wrapper format differs:
 * - Claude Code: JSON envelope { hookSpecificOutput: { additionalContext: <payload> } }
 * - OpenCode: system-role message prepended as "<!-- anvil-routing -->\n<payload>"
 *
 * Equality predicate: extract the payload from each adapter's wrapper and assert
 * byte-identical strings (modulo the marker line on the OC side).
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatClaudeCodeHookOutput } from '../../src/adapters/claude-code/hook-output.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

const ROUTING_MARKER = '<!-- anvil-routing -->'

/** Simulate the OC plugin's transform() logic (Plan 31 B3). */
async function simulateOcTransform(
  anvilRoot: string,
  messages: Array<{ role: string; content: string }>,
): Promise<Array<{ role: string; content: string }>> {
  let result = [...messages]
  // Read active-routing.json (same logic as the plugin)
  const { readFile } = await import('node:fs/promises')
  try {
    const raw = await readFile(
      join(anvilRoot, '.anvil', 'active-routing.json'),
      'utf-8',
    )
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'systemInsert' in parsed &&
      typeof (parsed as Record<string, unknown>).systemInsert === 'string'
    ) {
      const systemInsert = (parsed as { systemInsert: string }).systemInsert
      if (!result.some((m) => m.content.includes(ROUTING_MARKER))) {
        result = [
          {
            role: 'system',
            content: `${ROUTING_MARKER}\n${systemInsert}`,
          },
          ...result,
        ]
      }
    }
  } catch {
    // No active-routing.json — no-op
  }
  return result
}

/** Extract the payload from the CC adapter output envelope. */
function extractCcPayload(stdout: string): string | undefined {
  try {
    const parsed = JSON.parse(stdout) as {
      hookSpecificOutput?: { additionalContext?: string }
    }
    return parsed.hookSpecificOutput?.additionalContext
  } catch {
    return undefined
  }
}

/** Extract the payload from an OC messages array (after the marker line). */
function extractOcPayload(
  messages: Array<{ role: string; content: string }>,
): string | undefined {
  const sysMsg = messages.find(
    (m) => m.role === 'system' && m.content.includes(ROUTING_MARKER),
  )
  if (!sysMsg) return undefined
  const markerLine = `${ROUTING_MARKER}\n`
  const idx = sysMsg.content.indexOf(markerLine)
  return idx === -1 ? undefined : sysMsg.content.slice(idx + markerLine.length)
}

let tmpDir: string

beforeEach(async () => {
  tmpDir = createTestTmpDir('h5-parity')
  await mkdir(join(tmpDir, '.anvil'), { recursive: true })
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('adapter parity — systemInsert payload (Plan 31 H5)', () => {
  it('CC and OC adapters deliver byte-identical systemInsert payload', async () => {
    const testPayload =
      '🔴 DIRECTIVE: use ultra-worker agent for "debug the null pointer"\n  agent: ultra-worker\n  skills: debugging'

    // Write active-routing.json for OC
    await writeFile(
      join(tmpDir, '.anvil', 'active-routing.json'),
      JSON.stringify({
        systemInsert: testPayload,
        prompt: 'debug',
        timestamp: new Date().toISOString(),
      }),
      'utf-8',
    )

    // CC adapter path
    const ccResult = formatClaudeCodeHookOutput('UserPromptSubmit', {
      exitCode: 0,
      systemInsert: testPayload,
    })
    const ccPayload = extractCcPayload(ccResult.stdout)

    // OC adapter path
    const ocMessages = await simulateOcTransform(tmpDir, [
      { role: 'user', content: 'debug the null pointer' },
    ])
    const ocPayload = extractOcPayload(ocMessages)

    expect(ccPayload).toBeDefined()
    expect(ocPayload).toBeDefined()
    // Byte-identical payload on both sides
    expect(ccPayload).toBe(testPayload)
    expect(ocPayload).toBe(testPayload)
    expect(ccPayload).toBe(ocPayload)
  })

  it('CC wraps systemInsert in hookSpecificOutput JSON envelope', () => {
    const payload = 'routing directive text'
    const ccResult = formatClaudeCodeHookOutput('UserPromptSubmit', {
      exitCode: 0,
      systemInsert: payload,
    })
    const parsed = JSON.parse(ccResult.stdout) as {
      hookSpecificOutput?: { hookEventName: string; additionalContext: string }
    }
    expect(parsed.hookSpecificOutput?.hookEventName).toBe('UserPromptSubmit')
    expect(parsed.hookSpecificOutput?.additionalContext).toBe(payload)
  })

  it('OC wraps systemInsert as a system-role message with the routing marker', async () => {
    const payload = 'routing directive text'
    await writeFile(
      join(tmpDir, '.anvil', 'active-routing.json'),
      JSON.stringify({
        systemInsert: payload,
        prompt: 'test',
        timestamp: new Date().toISOString(),
      }),
      'utf-8',
    )
    const ocMessages = await simulateOcTransform(tmpDir, [
      { role: 'user', content: 'hello' },
    ])
    const sysMsg = ocMessages.find(
      (m) => m.role === 'system' && m.content.includes(ROUTING_MARKER),
    )
    expect(sysMsg).toBeDefined()
    expect(sysMsg?.content).toContain(ROUTING_MARKER)
    expect(sysMsg?.content).toContain(payload)
    // System message is prepended (index 0)
    expect(ocMessages[0].role).toBe('system')
  })

  it('OC transform() is idempotent (marker prevents double-injection)', async () => {
    const payload = 'routing directive text'
    await writeFile(
      join(tmpDir, '.anvil', 'active-routing.json'),
      JSON.stringify({
        systemInsert: payload,
        prompt: 'test',
        timestamp: new Date().toISOString(),
      }),
      'utf-8',
    )
    const messages: Array<{ role: string; content: string }> = [
      { role: 'user', content: 'hello' },
    ]
    const once = await simulateOcTransform(tmpDir, messages)
    const twice = await simulateOcTransform(tmpDir, once)
    // Should only have one system message with the marker
    const markerMsgs = twice.filter(
      (m) => m.role === 'system' && m.content.includes(ROUTING_MARKER),
    )
    expect(markerMsgs.length).toBe(1)
  })

  it('no active-routing.json → OC transform is a no-op', async () => {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'user', content: 'hello' },
    ]
    const result = await simulateOcTransform(tmpDir, messages)
    expect(result).toHaveLength(1)
    expect(result[0].role).toBe('user')
  })
})

// ─── Plan 32 F6 — OC AGENTS.md rules block parity ───────────────────────────

describe('OpenCode AGENTS.md rules block parity (Plan 32 F6)', () => {
  it('AGENTS.md block uses the same routing intents as the CC rules file', async () => {
    const { ANVIL_ROUTING_RULES_CONTENT, ANVIL_OC_ROUTING_CONTENT } =
      await import('../../src/core/routing-rules-content.js')

    // Extract the routing intent lines from both versions.
    // Intent lines start with "- " and contain " → ".
    const extractIntents = (content: string): string[] =>
      content
        .split('\n')
        .filter((l) => l.startsWith('- ') && l.includes(' → '))
        .map((l) => l.trim())

    const ccIntents = extractIntents(ANVIL_ROUTING_RULES_CONTENT)
    const ocIntents = extractIntents(ANVIL_OC_ROUTING_CONTENT)

    // Both versions must cover the same set of intents (same count, same targets).
    expect(ocIntents.length).toBe(ccIntents.length)
    for (let i = 0; i < ccIntents.length; i++) {
      // The agent/skill targets after " → " must be identical.
      const ccTarget = ccIntents[i]?.split(' → ')[1]
      const ocTarget = ocIntents[i]?.split(' → ')[1]
      expect(ocTarget).toBe(ccTarget)
    }
  })

  it('AGENTS.md block is wrapped with canonical HTML comment markers', async () => {
    const { writeOpenCodeStandingInstructions } = await import(
      '../../src/installer/install.js'
    )
    const { OC_ROUTING_MARKER_OPEN, OC_ROUTING_MARKER_CLOSE } = await import(
      '../../src/core/routing-rules-content.js'
    )

    await writeOpenCodeStandingInstructions(tmpDir, false)

    const { readFile } = await import('node:fs/promises')
    const content = await readFile(join(tmpDir, 'AGENTS.md'), 'utf-8')

    expect(content).toContain(OC_ROUTING_MARKER_OPEN)
    expect(content).toContain(OC_ROUTING_MARKER_CLOSE)

    const openIdx = content.indexOf(OC_ROUTING_MARKER_OPEN)
    const closeIdx = content.indexOf(OC_ROUTING_MARKER_CLOSE)
    expect(openIdx).toBeLessThan(closeIdx)
  })

  it('CC rules file and OC AGENTS.md block both contain the confidence threshold', async () => {
    const { ANVIL_ROUTING_RULES_CONTENT, ANVIL_OC_ROUTING_CONTENT } =
      await import('../../src/core/routing-rules-content.js')

    expect(ANVIL_ROUTING_RULES_CONTENT).toContain('≥0.65')
    expect(ANVIL_OC_ROUTING_CONTENT).toContain('≥0.65')
  })
})
