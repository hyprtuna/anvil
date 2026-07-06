/**
 * Executable-plan parser (ANV-0026)
 *
 * Reads a plan markdown file's YAML frontmatter and validates the
 * `executable_plan:` block against the `ExecutablePlan` Zod schema.
 *
 * Why frontmatter-driven (not table-driven):
 *   - YAML is the canonical metadata channel in Anvil (tickets, skills,
 *     agents all use it). Reusing the channel keeps the cognitive surface
 *     small.
 *   - A table-driven parser would couple to column order and human-friendly
 *     formatting choices (line wraps, escaping, emoji). Brittle.
 *   - Frontmatter is additive: existing plan markdown bodies are unchanged.
 *
 * Failure modes:
 *   - Missing frontmatter        → ParseResult { ok: false, reason: 'no-frontmatter' }.
 *   - Missing `executable_plan:` → ParseResult { ok: false, reason: 'no-executable-plan-key' }.
 *   - Zod validation failure     → ParseResult { ok: false, reason: 'schema-invalid', error }.
 *   - File read failure          → only `parseExecutablePlanFromFile` throws.
 */

import { readFile } from 'node:fs/promises'
import matter from 'gray-matter'
import type { ZodError } from 'zod'
import { ExecutablePlan } from './schema.js'

// `ExecutablePlan` is both a Zod schema (value) and the inferred type
// (declaration merge in schema.ts). Re-export the type so the public
// surface (`parse.ts` consumers) doesn't need to import twice.
export type { ExecutablePlan } from './schema.js'

// ─── Result types ────────────────────────────────────────────────────────────

/**
 * Discriminated union returned by `parseExecutablePlan`.
 * `ok: true` carries the validated plan; `ok: false` carries a structured
 * reason the caller can branch on or render as a CLI error.
 */
export type ParseResult =
  | { ok: true; plan: ExecutablePlan }
  | { ok: false; reason: 'no-frontmatter'; message: string }
  | { ok: false; reason: 'no-executable-plan-key'; message: string }
  | {
      ok: false
      reason: 'schema-invalid'
      message: string
      error: ZodError
    }

// ─── Parsers ─────────────────────────────────────────────────────────────────

/**
 * Parse a plan from its raw markdown content.
 *
 * Pure function — no I/O. Use `parseExecutablePlanFromFile` if you have a
 * path on disk.
 */
export function parseExecutablePlan(markdown: string): ParseResult {
  // gray-matter returns `data: {}` when no frontmatter is present.
  // We need to distinguish "no frontmatter at all" from "frontmatter but
  // no executable_plan key" — they're different remediation steps.
  const parsed = matter(markdown)
  const data = parsed.data as Record<string, unknown>

  const hasFrontmatter =
    markdown.startsWith('---\n') || markdown.startsWith('---\r\n')
  if (!hasFrontmatter) {
    return {
      ok: false,
      reason: 'no-frontmatter',
      message:
        'plan markdown has no YAML frontmatter; add a `---` block at the top with an `executable_plan:` key',
    }
  }

  if (!('executable_plan' in data)) {
    return {
      ok: false,
      reason: 'no-executable-plan-key',
      message: 'frontmatter is present but missing the `executable_plan:` key',
    }
  }

  const result = ExecutablePlan.safeParse(data.executable_plan)
  // Note: `ExecutablePlan` here refers to the Zod schema (value).
  // The `type ExecutablePlan` re-export above gives consumers the inferred type.
  if (!result.success) {
    return {
      ok: false,
      reason: 'schema-invalid',
      message: formatZodError(result.error),
      error: result.error,
    }
  }

  return { ok: true, plan: result.data }
}

/**
 * Same as `parseExecutablePlan` but reads from disk first.
 * Throws on file-read errors (the caller is presumed to want a clear
 * error message including the offending path).
 */
export async function parseExecutablePlanFromFile(
  path: string,
): Promise<ParseResult> {
  let raw: string
  try {
    raw = await readFile(path, 'utf-8')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`failed to read plan file "${path}": ${message}`)
  }
  return parseExecutablePlan(raw)
}

// ─── Error formatting ────────────────────────────────────────────────────────

/**
 * Render a Zod error as a multi-line string. Each issue gets one line:
 *   `  - path.to.field: message`
 *
 * Kept simple — callers that want machine-readable output can use the
 * `error` property on the `ParseResult` directly.
 */
function formatZodError(error: ZodError): string {
  const lines = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
    return `  - ${path}: ${issue.message}`
  })
  return `executable_plan failed schema validation:\n${lines.join('\n')}`
}
