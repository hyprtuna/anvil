/**
 * SystemDirective helpers — ANV-0049.
 *
 * Typed vocabulary for model-visible context injections. Handlers use
 * `createSystemDirective` to tag their `systemInsert` strings; the dispatcher
 * calls `dedupeDirectives` before aggregating results so at most one directive
 * per type reaches the model per turn.
 *
 * Wire format: `[DIRECTIVE:<TYPE>]\n<body>`
 * The opening tag is stripped by `parseSystemDirective` and is never shown to
 * the user (the `message` field handles the user-visible channel).
 */

import { SystemDirectiveType } from '../core/types.js'

/** Sentinel prefix that tags a systemInsert string with its directive type. */
const TAG_PREFIX = '[DIRECTIVE:'
const TAG_SUFFIX = ']'

/**
 * Wrap `body` with a typed tag so the dispatcher can dedupe by type.
 *
 * Example:
 *   createSystemDirective('ROUTING_HINT', 'Use Skill({skill: "anvil:debugging"})')
 *   // → '[DIRECTIVE:ROUTING_HINT]\nUse Skill({skill: "anvil:debugging"})'
 */
export function createSystemDirective(
  type: SystemDirectiveType,
  body: string,
): string {
  return `${TAG_PREFIX}${type}${TAG_SUFFIX}\n${body}`
}

/**
 * Parse the type tag from a systemInsert string produced by
 * `createSystemDirective`. Returns `null` when the string is untagged
 * (produced by a pre-ANV-0049 handler or raw literal) — untagged strings
 * are treated as opaque bodies and deduplicated by content identity only.
 */
export function parseSystemDirective(value: string): {
  type: SystemDirectiveType | null
  body: string
} {
  if (!value.startsWith(TAG_PREFIX)) return { type: null, body: value }
  const tagEnd = value.indexOf(TAG_SUFFIX)
  if (tagEnd === -1) return { type: null, body: value }
  const rawType = value.slice(TAG_PREFIX.length, tagEnd)
  const body = value.slice(tagEnd + TAG_SUFFIX.length + 1) // skip '\n'

  // Validate the raw type string is a known SystemDirectiveType.
  // Use SystemDirectiveType.options as the single source of truth (avoids enum drift).
  const knownTypes: readonly string[] = SystemDirectiveType.options
  const type = knownTypes.includes(rawType)
    ? (rawType as SystemDirectiveType)
    : null

  return { type, body }
}

/**
 * Deduplicate an array of `systemInsert` strings by directive type.
 *
 * Rules:
 * - For typed directives (produced by `createSystemDirective`): keep the
 *   **last** string for each type (later handlers have higher specificity).
 * - Untagged strings (legacy / raw) are passed through without deduplication
 *   unless they are byte-identical to a previously seen untagged string.
 * - Order within each type bucket is preserved; typed directives are emitted
 *   in first-seen-type order, untagged strings follow.
 *
 * @param inserts  Raw `systemInsert` values collected from handler results.
 * @returns        Deduplicated and merged single string, or `undefined` when
 *                 `inserts` is empty.
 */
export function dedupeDirectives(inserts: string[]): string | undefined {
  if (inserts.length === 0) return undefined

  // Typed: last-wins per type; preserve first-seen type order.
  const typedOrder: SystemDirectiveType[] = []
  const typedMap = new Map<SystemDirectiveType, string>()

  // Untagged: dedupe by identity; preserve order.
  const untaggedSeen = new Set<string>()
  const untagged: string[] = []

  for (const insert of inserts) {
    const { type, body } = parseSystemDirective(insert)
    if (type !== null) {
      if (!typedMap.has(type)) typedOrder.push(type)
      typedMap.set(type, body)
    } else {
      if (!untaggedSeen.has(insert)) {
        untaggedSeen.add(insert)
        untagged.push(insert)
      }
    }
  }

  const parts: string[] = [
    ...typedOrder.map((t) => typedMap.get(t) as string),
    ...untagged,
  ]
  if (parts.length === 0) return undefined
  return parts.join('\n\n')
}
