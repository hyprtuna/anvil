/**
 * Description disambiguation transform (Plan 31 C2).
 *
 * When a skill/agent frontmatter has a `disambiguator` field, the loader
 * calls this function to prefix the description with `Anvil's <disambiguator>: <original>`
 * so Anvil surfaces win description-collision matches against Claude built-ins.
 *
 * Layer 0 — pure function, no I/O, no side-effects.
 */

export const MAX_DESCRIPTION_LENGTH = 200

/**
 * Result of applying a disambiguator prefix to a description.
 */
export interface DisambiguateResult {
  /** The new description to use (prefixed). */
  description: string
  /** The original, unprefixed description. */
  originalDescription: string
}

/**
 * Apply a disambiguator prefix to a description.
 *
 * @throws {Error} If the prefix alone (`Anvil's <disambiguator>: `) is ≥200 chars.
 *
 * @param disambiguator - The disambiguator string from frontmatter.
 * @param originalDescription - The original description from frontmatter.
 * @returns The prefixed description and the preserved original.
 */
export function applyDisambiguator(
  disambiguator: string,
  originalDescription: string,
): DisambiguateResult {
  const prefix = `Anvil's ${disambiguator}: `

  if (prefix.length >= MAX_DESCRIPTION_LENGTH) {
    throw new Error(
      `Disambiguator too long; keep under ~180 chars. Prefix "Anvil's ${disambiguator}: " is ${prefix.length} chars (must be <${MAX_DESCRIPTION_LENGTH}).`,
    )
  }

  const combined = prefix + originalDescription

  let description: string
  if (combined.length <= MAX_DESCRIPTION_LENGTH) {
    description = combined
  } else {
    // Truncate the original portion to fit; cut at last word boundary.
    const budget = MAX_DESCRIPTION_LENGTH - prefix.length - 1 // -1 for the ellipsis char
    const truncated = originalDescription.slice(0, budget)
    const lastSpace = truncated.lastIndexOf(' ')
    const cut = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated
    description = `${prefix + cut}…`
  }

  return { description, originalDescription }
}
