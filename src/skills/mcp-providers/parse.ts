/**
 * ANV-0037 — Parse a per-skill `mcp.json` sidecar.
 *
 * Accepts either a top-level array of refs, or an envelope `{ servers: [...] }`.
 * Returns a discriminated Result so callers can surface validation errors
 * without exception handling.
 */
import { z } from 'zod'
import { SkillMcpServerRef } from '../../core/types.js'

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error }

const ArrayShape = z.array(SkillMcpServerRef)
const EnvelopeShape = z.object({ servers: z.array(SkillMcpServerRef) })

/**
 * Parse arbitrary JSON-shaped input into a list of {@link SkillMcpServerRef}.
 * Two accepted shapes:
 *   1. `[{...}, {...}]`             — bare array (preferred).
 *   2. `{ servers: [{...}, ...] }`  — envelope (GitNexus precedent).
 */
export function parseSidecar(
  input: unknown,
): ParseResult<Array<z.infer<typeof SkillMcpServerRef>>> {
  const arr = ArrayShape.safeParse(input)
  if (arr.success) return { ok: true, value: arr.data }
  const env = EnvelopeShape.safeParse(input)
  if (env.success) return { ok: true, value: env.data.servers }
  const issues = [...arr.error.issues, ...env.error.issues]
    .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
    .join('; ')
  return {
    ok: false,
    error: new Error(`invalid mcp.json sidecar: ${issues}`),
  }
}
