/**
 * Typed workflow argument resolution (ANV-0039).
 *
 * This module is the security boundary between user-supplied input and workflow
 * command execution. It enforces that:
 *
 *   1. All user input is validated against the declared argument schema.
 *   2. Shell metacharacters are rejected unless the argument is explicitly
 *      marked `shell-required: true`.
 *   3. Values are coerced to their declared type (string, number, boolean).
 *   4. Unknown arguments are rejected (strict allowlist).
 *   5. Required arguments must be present.
 *
 * The resolved value record is safe to spread into spawn-style argv arrays.
 * It must NEVER be joined into a shell string.
 *
 * Pairs with: WorkflowArgument, WorkflowStep, WorkflowDefinition in types.ts.
 * Dependencies: ANV-0022 (command safety metadata) for destructive step approval.
 */

import type { WorkflowArgument } from '../types.js'

// ─── Shell metacharacter detection ──────────────────────────────────────────
/**
 * Characters and sequences that are dangerous when interpolated into a shell
 * string. This list is conservative — it includes anything that could alter
 * command interpretation under any POSIX-compatible shell.
 *
 * Reference: POSIX shell special characters + common injection vectors.
 */
// Biome's noControlCharactersInRegex rule disallows \n, \r, \x00 inline in
// regex literals. We use charCodeAt-based detection for those control chars
// and a separate regex for the printable shell metacharacters.
const SHELL_METACHAR_PRINTABLE_PATTERN = /[;&|`$<>!#]|\$\(|\$\{|\|\|/

/**
 * Returns true if `value` contains shell metacharacters that would be
 * dangerous if the string were interpolated into a shell command.
 *
 * Checks two categories:
 *   1. Printable POSIX shell special characters (via regex).
 *   2. Control characters: LF (\n), CR (\r), NUL (\x00) — detected by charCode.
 */
function containsShellMetachars(value: string): boolean {
  if (SHELL_METACHAR_PRINTABLE_PATTERN.test(value)) return true
  // Check for control characters: LF=10, CR=13, NUL=0
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code === 0 || code === 10 || code === 13) return true
  }
  return false
}

// ─── Result type ─────────────────────────────────────────────────────────────
export type ResolveOk = {
  ok: true
  value: Record<string, string | number | boolean>
}
export type ResolveErr = { ok: false; error: string }
export type ResolveResult = ResolveOk | ResolveErr

// ─── resolveWorkflowArgs ──────────────────────────────────────────────────────
/**
 * Validates and coerces user-supplied `inputs` against `schema`.
 *
 * @param schema   Declared WorkflowArgument[] from the workflow definition.
 * @param inputs   Raw user-supplied key→value map (all values may be strings).
 * @returns        `{ ok: true, value }` on success; `{ ok: false, error }` on failure.
 *
 * Safety contract: the returned `value` record contains only coerced scalars
 * (string | number | boolean). No entry has passed through shell metacharacter
 * injection unless the argument was explicitly marked `shell-required: true`.
 */
export function resolveWorkflowArgs(
  schema: WorkflowArgument[],
  inputs: Record<string, unknown>,
): ResolveResult {
  const declared = new Set(schema.map((a) => a.name))
  const resolved: Record<string, string | number | boolean> = {}

  // 1. Reject unknown arguments (strict allowlist).
  for (const key of Object.keys(inputs)) {
    if (!declared.has(key)) {
      return {
        ok: false,
        error: `Unknown argument: "${key}". Declared arguments: [${[...declared].join(', ')}]`,
      }
    }
  }

  // 2. Validate and coerce each declared argument.
  for (const arg of schema) {
    const raw = inputs[arg.name]

    // 2a. Required check.
    if (raw === undefined || raw === null || raw === '') {
      if (arg.required) {
        return {
          ok: false,
          error: `Missing required argument: "${arg.name}" (${arg.type}) — ${arg.description}`,
        }
      }
      // Optional and absent — skip.
      continue
    }

    const rawStr = String(raw)

    // 2b. Shell metacharacter rejection (unless arg is shell-required).
    if (!arg['shell-required'] && typeof rawStr === 'string') {
      if (containsShellMetachars(rawStr)) {
        return {
          ok: false,
          error: `Argument "${arg.name}" contains shell metacharacters or injection payload. To pass shell syntax explicitly, mark the argument with shell-required: true in the workflow definition.`,
        }
      }
    }

    // 2c. Type coercion.
    switch (arg.type) {
      case 'string': {
        resolved[arg.name] = rawStr
        break
      }
      case 'number': {
        // Reject non-numeric strings outright (NaN is not a valid number).
        const n = Number(rawStr)
        if (!Number.isFinite(n)) {
          return {
            ok: false,
            error: `Argument "${arg.name}" expects a number but received: ${JSON.stringify(rawStr)}`,
          }
        }
        resolved[arg.name] = n
        break
      }
      case 'boolean': {
        if (rawStr === 'true' || raw === true) {
          resolved[arg.name] = true
        } else if (rawStr === 'false' || raw === false) {
          resolved[arg.name] = false
        } else {
          return {
            ok: false,
            error: `Argument "${arg.name}" expects a boolean ("true" or "false") but received: ${JSON.stringify(rawStr)}`,
          }
        }
        break
      }
    }
  }

  return { ok: true, value: resolved }
}
