/**
 * ANV-0206 — Strip the `x-anvil:` vendor-extension block from markdown
 * frontmatter before emitting to host tools (Claude Code, OpenCode).
 *
 * Host tools must never see `x-anvil:` in skill or agent files — it is
 * an Anvil-internal namespace. Stripping happens at adapter render time,
 * just before writing the output bytes.
 *
 * Approach: regex-based YAML block removal rather than a full YAML parse/
 * stringify round-trip, to avoid reformatting the entire frontmatter and
 * introducing unnecessary diffs in emitted files.
 *
 * The function:
 *   1. Detects the frontmatter block (between leading `---` markers).
 *   2. Removes the `x-anvil:` key and all its indented child lines.
 *   3. Returns the cleaned markdown string.
 *
 * If no `x-anvil:` key is found, the input is returned unchanged (idempotent).
 */

/**
 * Strip `x-anvil:` from the frontmatter of a markdown file's content string.
 * The content may or may not have a frontmatter block.
 *
 * @param content - Raw file content (frontmatter + body).
 * @returns Content with `x-anvil:` block removed from frontmatter.
 */
export function stripXAnvil(content: string): string {
  if (!content.startsWith('---')) {
    // No frontmatter — nothing to strip.
    return content
  }

  // Find the closing frontmatter delimiter.
  const closingIdx = content.indexOf('\n---', 3)
  if (closingIdx === -1) {
    // Malformed frontmatter (no closing delimiter) — return as-is.
    return content
  }

  const frontmatter = content.slice(3, closingIdx)
  if (
    !frontmatter.includes('\nx-anvil:') &&
    !frontmatter.startsWith('x-anvil:')
  ) {
    // Fast-path: no x-anvil key present.
    return content
  }

  // Remove the `x-anvil:` key and all its indented child lines.
  // Two-pass approach handles both cases:
  //   (a) x-anvil: appears mid-frontmatter, preceded by \n
  //   (b) x-anvil: is the very first line of the frontmatter block (no preceding \n)
  // Pass 1: first-line case — x-anvil: at position 0 of the frontmatter string.
  // Pass 2: mid-frontmatter case — x-anvil: preceded by \n.
  const cleaned = frontmatter
    .replace(/^x-anvil:(?:\n(?:[ \t][^\n]*|))*(?=\n[^\s\n]|\n*$)/, '')
    .replace(/\nx-anvil:(?:\n(?:[ \t][^\n]*|))*(?=\n[^\s\n]|\n*$)/g, '')

  const body = content.slice(closingIdx)
  return `---${cleaned}${body}`
}
