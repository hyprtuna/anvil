import { z } from 'zod'

/**
 * Plugin-local agent frontmatter schema.
 *
 * Intentionally duplicated from src/core/types.ts AgentFrontmatter (D-08).
 * The plugin is a self-contained ESM bundle — it cannot import from src/core/.
 * A shape-parity test at tests/unit/opencode-plugin/schema-parity.test.ts
 * detects drift between this schema and the canonical one.
 *
 * Only the fields the plugin actually consumes are declared; all others
 * pass through via .passthrough() so future additions to the canonical
 * schema never cause parse failures here.
 */
export const PluginAgentFrontmatter = z
  .object({
    /** Agent slug — must match Anvil's slug grammar: [a-z][a-z0-9-]* */
    name: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/, 'Agent name must match [a-z][a-z0-9-]*'),
    /** Human-readable description (optional in this context). */
    description: z.string().optional(),
    /**
     * Tool allowlist from the agent's frontmatter.
     * Informational only in v0.11.2 (D-06).
     */
    tools: z.array(z.string()).optional(),
    /** Display color hint; optional, passed through. */
    color: z.string().optional(),
    /**
     * ANV-0207 — OC mode injection.
     * Sourced from the `x-anvil: agent_mode:` block; flattened by parseYaml.
     * 'primary' → top-level OC menu agent. 'subagent' (default) → internal.
     */
    agent_mode: z.enum(['primary', 'subagent']).optional(),
  })
  .passthrough()

export type PluginAgentFrontmatter = z.infer<typeof PluginAgentFrontmatter>

/**
 * OC runtime mode values.
 * Anvil never emits 'all' — every agent has a deliberate side.
 */
export type OcMode = 'primary' | 'subagent'

/**
 * Parsed agent as cached by the registry.
 */
export interface ParsedAgent {
  slug: string
  systemBody: string
  tools?: string[]
  description?: string
  /** ANV-0207 — OpenCode `mode:` value derived from agent_mode frontmatter. */
  mode: OcMode
}
