/**
 * ANV-0130 — Agent render matrix (data-driven adapter projection).
 *
 * Replaces the procedural per-adapter switch/case for agent rendering with a
 * single `AGENT_CONFIGS` map. Each adapter declares — as data — which agent
 * files (if any) it emits, where they go, and how their content is projected.
 *
 * Why this lives in `src/agents/` (layer 3) and is imported by `src/adapters/`
 * (layer 5): the render policy belongs to the agent layer (it knows what an
 * agent is and how its source file should be projected). Adapters consume the
 * policy as data — they do not own it. Layer 5 → 3 is a downward import, which
 * the layer-imports architecture test allows.
 *
 * Adding a new adapter:
 *   1. Add the kind to `AdapterKind`.
 *   2. Add an entry to `AGENT_CONFIGS`.
 *   3. Add the adapter scaffold under `src/adapters/<kind>/`.
 * No edits to render logic required.
 */

import { readFile } from 'node:fs/promises'
import { stripXAnvil } from '../core/strip-x-anvil.js'
import type { Agent } from '../core/types.js'

/** Discriminator for every platform Anvil targets. */
export type AdapterKind = 'claude-code' | 'opencode'

/**
 * Shape of a single rendered agent artifact, intentionally structural
 * (no dependency on `src/adapters/interface.ts`) so layer 3 stays free of
 * layer 5 imports.
 */
export interface RenderedAgentFile {
  relativePath: string
  content: string
}

/**
 * Data-driven projection policy for one (adapter × agent) tuple.
 *
 * - `emit: false` means the adapter does not surface agents directly; they
 *   are routed through some other channel (e.g., opencode's plugin loader).
 *   When `emit` is false, `pathTemplate` and `contentSource` are ignored.
 *
 * - `pathTemplate` is a printf-lite template; the only supported variable is
 *   `{name}`, replaced by `agent.frontmatter.name`. Keeping the surface this
 *   narrow avoids invent-as-you-go templating syntax.
 *
 * - `contentSource` declares how the body of the emitted file is produced:
 *     'source-verbatim' — read `agent.sourcePath` and emit its raw bytes.
 *   Additional strategies (e.g. `'frontmatter-projection'`) can be added
 *   without changing the map shape.
 */
export interface AgentRenderConfig {
  emit: boolean
  pathTemplate?: string
  contentSource?: 'source-verbatim'
}

/**
 * Canonical per-adapter render policy. Encodes the behaviour that existed
 * before ANV-0130:
 *
 * - claude-code: each agent emitted as `agents/<name>.md` with the raw
 *   source file content (frontmatter + body, untouched).
 * - opencode: agents are NOT emitted as filesystem entries; the OpenCode
 *   plugin loader picks them up via `plugins/opencode/`.
 */
export const AGENT_CONFIGS: Record<AdapterKind, AgentRenderConfig> = {
  'claude-code': {
    emit: true,
    pathTemplate: 'agents/{name}.md',
    contentSource: 'source-verbatim',
  },
  opencode: {
    emit: false,
  },
}

/**
 * Render a single agent under the supplied config. Returns `null` when the
 * config disables emission for this adapter.
 *
 * Pure function modulo `readFile` — config-in, file-out.
 */
export async function renderAgent(
  agent: Agent,
  config: AgentRenderConfig,
): Promise<RenderedAgentFile | null> {
  if (!config.emit) return null
  if (!config.pathTemplate) {
    throw new Error(
      'AgentRenderConfig with emit=true must declare a pathTemplate',
    )
  }
  if (config.contentSource !== 'source-verbatim') {
    throw new Error(
      `AgentRenderConfig.contentSource not supported: ${String(config.contentSource)}`,
    )
  }
  const rawContent = await readFile(agent.sourcePath, 'utf-8')
  // ANV-0206: strip x-anvil: block so host tools (CC, OC) never see Anvil-internal fields.
  const content = stripXAnvil(rawContent)
  const relativePath = config.pathTemplate.replace(
    '{name}',
    agent.frontmatter.name,
  )
  return { relativePath, content }
}

/**
 * Render every supplied agent under an adapter's config. Skips silently
 * when the adapter's config has `emit: false`, returning an empty array.
 *
 * Iteration order matches the input array order — callers control sorting.
 */
export async function renderAgentsFor(
  adapter: AdapterKind,
  agents: readonly Agent[],
): Promise<RenderedAgentFile[]> {
  const config = AGENT_CONFIGS[adapter]
  if (!config.emit) return []
  const out: RenderedAgentFile[] = []
  for (const agent of agents) {
    const rendered = await renderAgent(agent, config)
    if (rendered !== null) out.push(rendered)
  }
  return out
}
