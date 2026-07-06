import {
  type OcMode,
  type ParsedAgent,
  PluginAgentFrontmatter,
} from './schema.js'

/**
 * Split raw agent file content into frontmatter YAML and body markdown.
 * Expects the file to start with `---\n`, end the frontmatter with `\n---\n`.
 * Returns null when the expected delimiters are absent.
 */
function splitFrontmatter(
  content: string,
): { yaml: string; body: string } | null {
  if (!content.startsWith('---\n')) return null
  const end = content.indexOf('\n---\n', 4)
  if (end === -1) return null
  const yaml = content.slice(4, end)
  const body = content.slice(end + 5)
  return { yaml, body }
}

/**
 * Minimal YAML key:value line parser for agent frontmatter.
 *
 * Handles:
 *   key: scalar value
 *   key: [item1, item2]   (flow sequence)
 *
 * This is intentionally narrow — agent frontmatter is uniform and shallow.
 * A full js-yaml dependency is avoided to keep the plugin bundle lean.
 *
 * Collision-safety: only root-level lines (zero leading whitespace) are
 * emitted as top-level keys. The one nested key the plugin needs —
 * `agent_mode` under `x-anvil:` — is extracted explicitly by a one-level
 * walk so it lands at the root as `agent_mode` without risking collisions
 * with same-named root keys such as `name:` or `description:`.
 */
function parseYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = yaml.split('\n')

  /** Parse a scalar / flow-sequence string into a JS value. */
  function parseValue(rawValue: string): unknown {
    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      const inner = rawValue.slice(1, -1)
      return inner
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    }
    if (rawValue === 'true') return true
    if (rawValue === 'false') return false
    return rawValue !== '' ? rawValue : undefined
  }

  let i = 0
  while (i < lines.length) {
    const rawLine = lines[i]!
    i++

    // Skip blank and comment lines.
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue

    // Only process root-level lines (no leading whitespace).
    if (/^[ \t]/.test(rawLine)) continue

    const colonIdx = rawLine.indexOf(':')
    if (colonIdx === -1) continue

    const key = rawLine.slice(0, colonIdx).trim()
    if (!key) continue

    const rawValue = rawLine.slice(colonIdx + 1).trim()

    if (key === 'x-anvil') {
      // One-level walk: extract known nested keys without hoisting generically.
      // Only `agent_mode` is consumed by the plugin; others are ignored.
      while (i < lines.length) {
        const nested = lines[i]!
        // Stop when we reach a non-indented non-blank line (next root key).
        if (nested.trim() !== '' && !/^[ \t]/.test(nested)) break
        i++
        if (!nested.trim() || nested.trim().startsWith('#')) continue
        const nestedColon = nested.indexOf(':')
        if (nestedColon === -1) continue
        const nestedKey = nested.slice(0, nestedColon).trim()
        const nestedValue = nested.slice(nestedColon + 1).trim()
        if (nestedKey === 'agent_mode' && nestedValue !== '') {
          // Only set if not already set by a root-level key (root wins).
          if (!('agent_mode' in result)) {
            result.agent_mode = nestedValue
          }
        }
      }
      continue
    }

    const parsed = parseValue(rawValue)
    if (parsed !== undefined) {
      result[key] = parsed
    }
  }
  return result
}

/**
 * Map the Anvil `agent_mode` frontmatter value to an OpenCode `mode` value.
 *
 * Anvil invariant: never emit `all` — every shipped agent has a deliberate
 * side. When `agent_mode` is absent or unrecognised, default to `subagent`.
 *
 * @param agent_mode - Value of `x-anvil.agent_mode` from the frontmatter.
 * @returns OcMode ('primary' | 'subagent')
 */
export function toOcMode(agent_mode: string | undefined): OcMode {
  if (agent_mode === 'primary') return 'primary'
  return 'subagent'
}

/**
 * Parse a raw agent `.md` file into a `ParsedAgent`.
 *
 * Returns `null` on any parse or validation failure (bad frontmatter, missing
 * or invalid `name`, etc.). Failures are written to stderr as a warning.
 *
 * @param content - Raw UTF-8 content of the agent `.md` file.
 * @param hint    - File path hint for error messages (not used in logic).
 */
export function parseAgentFile(
  content: string,
  hint = '<unknown>',
): ParsedAgent | null {
  const split = splitFrontmatter(content)
  if (!split) {
    process.stderr.write(
      `[anvil] opencode-plugin: skipping agent file ${hint} — no frontmatter delimiters\n`,
    )
    return null
  }

  const raw = parseYaml(split.yaml)
  const result = PluginAgentFrontmatter.safeParse(raw)
  if (!result.success) {
    process.stderr.write(
      `[anvil] opencode-plugin: skipping agent file ${hint} — ${result.error.message}\n`,
    )
    return null
  }

  const fm = result.data
  return {
    slug: fm.name,
    systemBody: split.body.trim(),
    tools: fm.tools,
    description: fm.description,
    mode: toOcMode(fm.agent_mode),
  }
}
