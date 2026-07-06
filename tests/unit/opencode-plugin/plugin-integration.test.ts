import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ensureProjectDir,
  getProjectScopedPath,
} from '../../../src/core/io/project-scoped-paths.js'
import { agentMarker } from '../../../src/opencode-plugin/agents/dispatch.js'
import { AnvilPlugin } from '../../../src/opencode-plugin/index.js'

/**
 * Plugin integration test (Task 3.3).
 *
 * Stands up the plugin with a fixture ANVIL_ROOT via ANVIL_ROOT_OVERRIDE
 * and exercises the full transform pipeline. Verifies message ordering:
 *   [system(routing), system(agent-persona), user(body + bootstrap-marker)]
 *
 * ANVIL_ROOT_OVERRIDE is read at AnvilPlugin() call time (not module load),
 * so we do not need cache-busting on imports — just set the env var before
 * calling AnvilPlugin() each test.
 */

const ROUTING_MARKER = '<!-- anvil-routing -->'
const BOOTSTRAP_MARKER = '<!-- anvil:bootstrap -->'

// Fixture agent content
const AGENT_A_CONTENT = `---
name: agent-a
description: Integration test agent A
tools: [Read, Glob]
---

You are agent-a. You assist with reading files.`

const AGENT_B_CONTENT = `---
name: agent-b
description: Integration test agent B
---

You are agent-b. You assist with analysis.`

// Bootstrap skill content
const BOOTSTRAP_SKILL = '# Using Anvil\n\nThis is the bootstrap skill content.'

// Routing directive
const ROUTING_DIRECTIVE = `{"systemInsert":"Route all requests through Anvil."}`

describe('AnvilPlugin integration — transform pipeline', () => {
  let tmpRoot: string
  let fakeAnvilHome: string

  beforeEach(async () => {
    tmpRoot = join(
      tmpdir(),
      `anvil-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    fakeAnvilHome = join(
      tmpdir(),
      `anvil-home-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    // Set up ANVIL_ROOT structure
    await mkdir(join(tmpRoot, 'agents'), { recursive: true })
    await mkdir(join(tmpRoot, 'skills', 'using-anvil'), { recursive: true })
    await mkdir(fakeAnvilHome, { recursive: true })

    await writeFile(join(tmpRoot, 'agents', 'agent-a.md'), AGENT_A_CONTENT)
    await writeFile(join(tmpRoot, 'agents', 'agent-b.md'), AGENT_B_CONTENT)
    await writeFile(
      join(tmpRoot, 'skills', 'using-anvil', 'SKILL.md'),
      BOOTSTRAP_SKILL,
    )

    // Write routing directive to the per-project path (ANVIL_HOME must be set first)
    process.env.ANVIL_HOME = fakeAnvilHome
    await ensureProjectDir(tmpRoot)
    const routingPath = await getProjectScopedPath(tmpRoot, 'active-routing')
    await writeFile(routingPath, ROUTING_DIRECTIVE)

    process.env.ANVIL_ROOT_OVERRIDE = tmpRoot
  })

  afterEach(async () => {
    process.env.ANVIL_ROOT_OVERRIDE = undefined
    // biome-ignore lint/performance/noDelete: process.env.ANVIL_HOME = undefined stores the string "undefined"; delete is the only way to unset an env var at runtime.
    delete process.env.ANVIL_HOME
    await rm(tmpRoot, { recursive: true, force: true })
    await rm(fakeAnvilHome, { recursive: true, force: true })
  })

  it('dispatches @anvil:agent-a with correct message ordering', async () => {
    // AnvilPlugin() reads ANVIL_ROOT_OVERRIDE at call time, so env var must
    // be set before this call (done in beforeEach).
    const plugin = await AnvilPlugin()
    const messages = [{ role: 'user', content: '@anvil:agent-a hello world' }]
    const result =
      await plugin.experimental!.chat!.messages!.transform!(messages)

    // Expected ordering: routing-system → agent-persona-system → user-with-bootstrap
    expect(result.length).toBeGreaterThanOrEqual(3)

    const routingMsg = result.find((m) => m.content.includes(ROUTING_MARKER))
    expect(routingMsg).toBeDefined()
    expect(routingMsg!.role).toBe('system')

    const personaMsg = result.find((m) =>
      m.content.includes(agentMarker('agent-a')),
    )
    expect(personaMsg).toBeDefined()
    expect(personaMsg!.role).toBe('system')
    expect(personaMsg!.content).toContain(
      'You are now operating as the @anvil:agent-a agent',
    )
    expect(personaMsg!.content).toContain('You are agent-a.')

    const userMsg = result.find((m) => m.role === 'user')
    expect(userMsg).toBeDefined()
    expect(userMsg!.content).toContain('hello world')
    expect(userMsg!.content).toContain(BOOTSTRAP_MARKER)

    // Verify ordering: routing comes before persona, persona comes before user
    const routingIdx = result.indexOf(routingMsg!)
    const personaIdx = result.indexOf(personaMsg!)
    const userIdx = result.indexOf(userMsg!)
    expect(routingIdx).toBeLessThan(personaIdx)
    expect(personaIdx).toBeLessThan(userIdx)
  })

  it('passthrough when no leading mention — no agent persona injected', async () => {
    const plugin = await AnvilPlugin()
    const messages = [{ role: 'user', content: 'just a normal message' }]
    const result =
      await plugin.experimental!.chat!.messages!.transform!(messages)

    // No agent persona message should appear
    const personaMsg = result.find((m) =>
      m.content.includes('<!-- anvil:agent:'),
    )
    expect(personaMsg).toBeUndefined()

    // Bootstrap still injected
    const userMsg = result.find((m) => m.role === 'user')
    expect(userMsg!.content).toContain(BOOTSTRAP_MARKER)
  })

  it('transform is idempotent on replay (marker guard)', async () => {
    const plugin = await AnvilPlugin()
    const messages = [{ role: 'user', content: '@anvil:agent-a check this' }]
    const first =
      await plugin.experimental!.chat!.messages!.transform!(messages)
    // Replay: pass the already-transformed array back through the same plugin instance.
    const second = await plugin.experimental!.chat!.messages!.transform!(first)

    // Persona marker should appear exactly once
    const personaMsgs = second.filter((m) =>
      m.content.includes(agentMarker('agent-a')),
    )
    expect(personaMsgs).toHaveLength(1)
  })
})
