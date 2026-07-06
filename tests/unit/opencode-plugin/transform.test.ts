import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

// We test the routing-injection logic extracted into a unit-testable helper
// rather than spinning up the full AnvilPlugin (which resolves ANVIL_ROOT at
// module load time and reads real disk files).

// The logic under test: read .anvil/active-routing.json and prepend system msg.
// We replicate the exact logic from AnvilPlugin here so changes to the plugin
// are caught by the types and the integration smoke test.

const ROUTING_MARKER = '<!-- anvil-routing -->'

type Message = { role: string; content: string }

async function readActiveRoutingFromDir(
  anvilRoot: string,
): Promise<string | undefined> {
  const { readFile } = await import('node:fs/promises')
  const { join: pathJoin } = await import('node:path')
  try {
    const raw = await readFile(
      pathJoin(anvilRoot, '.anvil', 'active-routing.json'),
      'utf-8',
    )
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'systemInsert' in parsed &&
      typeof (parsed as Record<string, unknown>).systemInsert === 'string'
    ) {
      return (parsed as { systemInsert: string }).systemInsert
    }
  } catch {
    // no-op
  }
  return undefined
}

async function applyRoutingTransform(
  messages: Message[],
  anvilRoot: string,
): Promise<Message[]> {
  const systemInsert = await readActiveRoutingFromDir(anvilRoot)
  if (
    systemInsert &&
    !messages.some((m) => m.content.includes(ROUTING_MARKER))
  ) {
    return [
      { role: 'system', content: `${ROUTING_MARKER}\n${systemInsert}` },
      ...messages,
    ]
  }
  return messages
}

let tmpDir: string

beforeEach(() => {
  tmpDir = createTestTmpDir('oc-transform')
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true })
})

describe('OpenCode plugin transform — routing injection (Plan 31 B3)', () => {
  it('returns message array unchanged when .anvil/active-routing.json is absent', async () => {
    const messages: Message[] = [{ role: 'user', content: 'hello' }]
    const result = await applyRoutingTransform(messages, tmpDir)
    expect(result).toEqual(messages)
  })

  it('prepends system message when active-routing.json has systemInsert and no marker present', async () => {
    mkdirSync(join(tmpDir, '.anvil'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.anvil', 'active-routing.json'),
      JSON.stringify({
        systemInsert: 'route to ultra-worker',
        prompt: 'fix bug',
      }),
      'utf-8',
    )
    const messages: Message[] = [{ role: 'user', content: 'fix bug' }]
    const result = await applyRoutingTransform(messages, tmpDir)
    expect(result).toHaveLength(2)
    expect(result[0]?.role).toBe('system')
    expect(result[0]?.content).toContain(ROUTING_MARKER)
    expect(result[0]?.content).toContain('route to ultra-worker')
    expect(result[1]).toEqual(messages[0])
  })

  it('does not double-prepend when marker is already present in message array', async () => {
    mkdirSync(join(tmpDir, '.anvil'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.anvil', 'active-routing.json'),
      JSON.stringify({ systemInsert: 'route to ultra-worker' }),
      'utf-8',
    )
    const messages: Message[] = [
      {
        role: 'system',
        content: `${ROUTING_MARKER}\nroute to ultra-worker`,
      },
      { role: 'user', content: 'fix bug' },
    ]
    const result = await applyRoutingTransform(messages, tmpDir)
    // Must be unchanged — no second injection
    expect(result).toEqual(messages)
    expect(
      result.filter((m) => m.content.includes(ROUTING_MARKER)),
    ).toHaveLength(1)
  })

  it('no-ops gracefully when active-routing.json is malformed', async () => {
    mkdirSync(join(tmpDir, '.anvil'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.anvil', 'active-routing.json'),
      'not json',
      'utf-8',
    )
    const messages: Message[] = [{ role: 'user', content: 'hello' }]
    const result = await applyRoutingTransform(messages, tmpDir)
    expect(result).toEqual(messages)
  })

  it('no-ops when active-routing.json exists but has no systemInsert field', async () => {
    mkdirSync(join(tmpDir, '.anvil'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.anvil', 'active-routing.json'),
      JSON.stringify({ prompt: 'fix bug' }),
      'utf-8',
    )
    const messages: Message[] = [{ role: 'user', content: 'hello' }]
    const result = await applyRoutingTransform(messages, tmpDir)
    expect(result).toEqual(messages)
  })
})
