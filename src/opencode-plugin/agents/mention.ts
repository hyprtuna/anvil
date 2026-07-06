/**
 * Leading-mention parser (D-01, D-02).
 *
 * Detects `@anvil:<slug>` anchored at the start of a user message (after
 * optional whitespace). Mid-message mentions are deliberately ignored to
 * prevent accidental dispatch when a user quotes prior conversation.
 *
 * Match is case-sensitive per D-01: `@anvil:code-reviewer` dispatches;
 * `@anvil:CODE-REVIEWER` does not.
 */

/** Slug grammar for Anvil agents: `[a-z][a-z0-9-]*` */
const SLUG_RE = /^[a-z][a-z0-9-]*$/

/**
 * Parse a leading `@anvil:<slug>` mention from a message string.
 *
 * @param content - Raw message content string.
 * @returns `{ slug, rest }` when a valid leading mention is found,
 *          `null` otherwise.
 */
export function parseLeadingMention(
  content: string,
): { slug: string; rest: string } | null {
  // Regex: optional leading whitespace, @anvil:, slug chars, required whitespace, rest
  // The `s` flag makes `.` match newlines (rest may be multi-line).
  const match = /^\s*@anvil:([a-z][a-z0-9-]*)\s+([\s\S]*)$/.exec(content)
  if (!match) return null

  const slug = match[1]
  const rest = match[2]

  // Double-check slug grammar (the regex already enforces it, but be explicit).
  if (!SLUG_RE.test(slug)) return null

  return { slug, rest }
}
