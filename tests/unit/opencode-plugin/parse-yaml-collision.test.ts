/**
 * Gate-3 Crit 1 — parseYaml collision-safety: nested keys under x-anvil:
 * must NOT overwrite root-level keys of the same name.
 *
 * Regression guard for the fix in src/opencode-plugin/agents/parse.ts that
 * switches from indiscriminate `.trim()` hoisting to a depth-aware walk.
 */

import { describe, expect, it } from 'vitest'
import { parseAgentFile } from '../../../src/opencode-plugin/agents/parse.js'

describe('parseAgentFile — parseYaml collision-safety', () => {
  it('name: under x-anvil: does NOT overwrite root name:', () => {
    const content = `---
name: real-agent
description: The real description
x-anvil:
  name: injected-name
  agent_mode: primary
---

Body text.`
    const result = parseAgentFile(content, 'real-agent.md')
    expect(result).not.toBeNull()
    // Root name wins; injected-name must be ignored.
    expect(result!.slug).toBe('real-agent')
  })

  it('description: under x-anvil: does NOT overwrite root description:', () => {
    const content = `---
name: test-agent
description: Root description
x-anvil:
  description: Injected description
  agent_mode: subagent
---

Body text.`
    const result = parseAgentFile(content, 'test-agent.md')
    expect(result).not.toBeNull()
    // Root description wins.
    expect(result!.description).toBe('Root description')
  })

  it('agent_mode under x-anvil: is correctly extracted as root agent_mode', () => {
    const content = `---
name: mode-agent
description: Mode test agent
x-anvil:
  tier: planning
  agent_mode: primary
---

Body text.`
    const result = parseAgentFile(content, 'mode-agent.md')
    expect(result).not.toBeNull()
    expect(result!.mode).toBe('primary')
  })

  it('root-level agent_mode wins over x-anvil: agent_mode when both present', () => {
    // Edge case: if someone puts agent_mode at root AND in x-anvil, root wins.
    const content = `---
name: dual-agent
description: Dual agent_mode test
agent_mode: subagent
x-anvil:
  agent_mode: primary
---

Body text.`
    const result = parseAgentFile(content, 'dual-agent.md')
    expect(result).not.toBeNull()
    // Root-level agent_mode: subagent was set before x-anvil walk → root wins.
    expect(result!.mode).toBe('subagent')
  })

  it('x-anvil: keys other than agent_mode are silently ignored', () => {
    const content = `---
name: safe-agent
description: Safety test
x-anvil:
  tier: quick
  role: worker
  user-invocable: false
---

Body text.`
    const result = parseAgentFile(content, 'safe-agent.md')
    expect(result).not.toBeNull()
    // tier, role, user-invocable should NOT appear on the ParsedAgent.
    expect(result!.slug).toBe('safe-agent')
    expect(result!.mode).toBe('subagent')
  })
})
