/**
 * Hook matchers — Plan 28 Phase D2.
 *
 * Hook config can carry an `if` field accepting Claude Code's
 * permission-rule syntax (documented in
 * `references/claude-docs/references/hooks.md`):
 *
 *   - `Bash(git *)`           — Bash tool with command starting with "git"
 *   - `Read(/src/**\/*.ts)`   — Read tool with file_path matching glob
 *   - `Skill(*)`              — any Skill invocation
 *   - `Agent(<name>)`         — invocation of agent named <name>
 *   - `mcp__server__tool`     — exact tool name match (also `mcp__server__*`)
 *
 * Each rule string parses to a predicate over the hook payload. A hook
 * with multiple rules in `if` is satisfied when ANY rule matches (logical
 * OR — same as CC). Empty / missing `if` means "always run".
 *
 * v0.4 ships glob + tool-name + agent-name filtering. Compound-command
 * splitting (`git status && rm -rf`) and read-only-command bypass arrive
 * with the matching dispatcher work in v0.5; matchers are designed so
 * those layers can plug in without breaking the rule grammar.
 */

export type RulePredicate = (payload: unknown) => boolean

interface ParsedRule {
  kind: 'tool' | 'tool-with-arg'
  /** Tool name, e.g. "Bash", "Read", "Skill", "Agent", "mcp__foo__bar". */
  tool: string
  /** Glob argument inside the parens, when present. */
  arg?: string
}

/**
 * Parse a rule string into a `ParsedRule`. Returns `null` for
 * unrecognisable input — the caller should treat that as "rule never
 * matches" rather than throwing, so a typo in user config does not
 * break dispatch.
 */
export function parseRule(rule: string): ParsedRule | null {
  const trimmed = rule.trim()
  if (trimmed.length === 0) return null
  const m = /^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/.exec(trimmed)
  if (!m) {
    // No parens — bare tool name, possibly mcp__server__tool with a glob.
    return { kind: 'tool', tool: trimmed }
  }
  return { kind: 'tool-with-arg', tool: m[1], arg: m[2] }
}

/**
 * Compile a glob pattern into a RegExp. Supports:
 *   - `*`     matches any run of non-`/` characters in path-like globs;
 *             matches any chars in non-path globs (so `Bash(git *)` works).
 *   - `**`    matches any number of path segments (slashes included).
 *   - `**\/`  matches zero or more path segments, including the trailing
 *             slash, so `/src/**\/*.ts` matches both `/src/a.ts` and
 *             `/src/a/b.ts`.
 *   - `?`     matches one character.
 * Other regex metacharacters are escaped.
 */
export function globToRegExp(glob: string): RegExp {
  const containsSlash = glob.includes('/')
  let out = '^'
  let i = 0
  while (i < glob.length) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          // `**/` collapses zero or more leading path segments.
          out += '(?:.*/)?'
          i += 3
          continue
        }
        out += '.*'
        i += 2
        continue
      }
      out += containsSlash ? '[^/]*' : '.*'
      i += 1
      continue
    }
    if (c === '?') {
      out += '.'
    } else if (/[\\^$.|+()[\]{}]/.test(c)) {
      out += `\\${c}`
    } else {
      out += c
    }
    i += 1
  }
  out += '$'
  return new RegExp(out)
}

/**
 * Pull the tool name from a hook payload. CC's stdin includes
 * `tool_name` for tool events (`PreToolUse`, `PostToolUse`); other
 * payload shapes (Skill / Agent / MCP elicitation) name the field
 * differently, so accept the documented synonyms.
 */
function readToolName(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const p = payload as Record<string, unknown>
  for (const key of ['tool_name', 'tool', 'name']) {
    const v = p[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}

function readToolArg(payload: unknown, ruleTool: string): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const p = payload as Record<string, unknown>
  const params =
    (p.tool_input as Record<string, unknown> | undefined) ??
    (p.params as Record<string, unknown> | undefined) ??
    (p.input as Record<string, unknown> | undefined)
  if (!params) return undefined
  // Tool-specific argument shapes — the documented Claude Code contract.
  if (ruleTool === 'Bash') {
    const cmd = params.command
    return typeof cmd === 'string' ? cmd : undefined
  }
  if (ruleTool === 'Read' || ruleTool === 'Edit' || ruleTool === 'Write') {
    const path = params.file_path ?? params.path
    return typeof path === 'string' ? path : undefined
  }
  if (ruleTool === 'Skill') {
    const name = params.skill ?? params.name
    return typeof name === 'string' ? name : undefined
  }
  if (ruleTool === 'Agent') {
    const name = params.agent ?? params.subagent_type ?? params.name
    return typeof name === 'string' ? name : undefined
  }
  return undefined
}

/**
 * Compile a rule string into a predicate over the hook payload.
 *
 * Returned predicates are pure and synchronous — the dispatcher calls
 * them per registered hook to decide whether to invoke the handler.
 */
export function permissionRuleToMatcher(rule: string): RulePredicate {
  const parsed = parseRule(rule)
  if (!parsed) return () => false
  if (parsed.kind === 'tool') {
    // No parens — match by tool name alone, possibly using a glob (mcp__*).
    const re = globToRegExp(parsed.tool)
    return (payload) => {
      const tool = readToolName(payload)
      return tool != null && re.test(tool)
    }
  }
  // tool-with-arg: tool name must match exactly OR via glob, plus arg-glob.
  const toolRe = globToRegExp(parsed.tool)
  const argRe =
    parsed.arg && parsed.arg.length > 0 ? globToRegExp(parsed.arg) : null
  return (payload) => {
    const tool = readToolName(payload)
    if (tool == null) return false
    if (!toolRe.test(tool)) return false
    if (argRe == null) return true
    const arg = readToolArg(payload, parsed.tool)
    if (arg == null) return false
    return argRe.test(arg)
  }
}

/**
 * Evaluate an `if` field against a payload. Logical OR across all rules
 * (matches CC's documented semantics). `undefined` / empty rules pass.
 */
export function evaluateIf(
  ifField: string | string[] | undefined,
  payload: unknown,
): boolean {
  if (ifField === undefined) return true
  const rules = Array.isArray(ifField) ? ifField : [ifField]
  if (rules.length === 0) return true
  return rules.some((r) => permissionRuleToMatcher(r)(payload))
}
