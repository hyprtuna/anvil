/**
 * Decision-coverage gate helpers (Plan 36 Phase E).
 *
 * Pure functions: extract D-NN: IDs from spec.md <decisions> block
 * and covered_decisions from plan.md frontmatter; compute coverage.
 *
 * Layer 0-adjacent — no I/O, no higher-layer imports.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface DecisionCoverageResult {
  passed: boolean
  /** Spec decision IDs that are NOT in plan's covered_decisions. */
  missing: string[]
  /** All decision IDs found in the spec. */
  specIds: string[]
  /** Decision IDs listed in the plan as covered. */
  coveredIds: string[]
}

// ── extractDecisionIds ─────────────────────────────────────────────────────

const DECISIONS_BLOCK_RE = /<decisions>([\s\S]*?)<\/decisions>/i
const DECISION_ID_RE_GLOBAL = /D-(\d{2,}):/gm

/**
 * Extract every `D-NN:` ID from inside the `<decisions>…</decisions>` block
 * of a spec.md string. Returns IDs in document order, deduplicated.
 *
 * If no `<decisions>` block is present, returns an empty array.
 */
export function extractDecisionIds(specContent: string): string[] {
  const blockMatch = DECISIONS_BLOCK_RE.exec(specContent)
  if (!blockMatch) return []

  const blockBody = blockMatch[1]
  const ids: string[] = []
  // Use matchAll to avoid assignment-in-condition lint rule
  const matches = blockBody.matchAll(DECISION_ID_RE_GLOBAL)
  for (const m of matches) {
    const id = `D-${m[1]}`
    if (!ids.includes(id)) ids.push(id)
  }

  return ids
}

// ── extractCoveredDecisions ────────────────────────────────────────────────

/**
 * Extract the `covered_decisions` list from a plan.md string.
 *
 * Looks for YAML frontmatter between `---` delimiters. Handles two shapes:
 *   - Top-level `covered_decisions:` list
 *   - Nested under `must_haves:` → `covered_decisions:` list
 *
 * Returns an empty array if no frontmatter or no covered_decisions is found.
 */
export function extractCoveredDecisions(planContent: string): string[] {
  // Extract YAML frontmatter
  if (!planContent.startsWith('---')) return []
  const end = planContent.indexOf('\n---', 3)
  if (end === -1) return []
  const frontmatter = planContent.slice(4, end)

  // Try top-level covered_decisions: list
  const topLevel = extractYamlList(frontmatter, 'covered_decisions')
  if (topLevel.length > 0) return topLevel

  // Try nested under must_haves:
  const mustHavesBlock = extractYamlNestedBlock(frontmatter, 'must_haves')
  if (mustHavesBlock) {
    const nested = extractYamlList(mustHavesBlock, 'covered_decisions')
    if (nested.length > 0) return nested
  }

  return []
}

/**
 * Simple YAML list extractor — finds `key:\n  - item` patterns.
 * Not a full YAML parser; handles the common plan frontmatter shape.
 */
function extractYamlList(yaml: string, key: string): string[] {
  const lines = yaml.split('\n')
  const items: string[] = []
  let inList = false
  const keyPrefix = `${key}:`

  for (const line of lines) {
    const stripped = line.trimStart()
    if (!inList) {
      if (stripped.startsWith(keyPrefix)) {
        inList = true
        // Check for inline empty list: `covered_decisions: []`
        const rest = stripped.slice(keyPrefix.length).trim()
        if (rest === '[]') return []
        // The current line is the key itself — don't process it as a list item
      }
    } else {
      if (stripped.startsWith('- ')) {
        const item = stripped.slice(2).trim()
        if (item) items.push(item)
      } else if (stripped.length > 0 && !stripped.startsWith('#')) {
        // Non-empty, non-comment, non-list line: list ended
        break
      }
    }
  }

  return items
}

/**
 * Extract a nested YAML block under a given key. Returns the block's
 * indented content as a string, or null if not found.
 */
function extractYamlNestedBlock(yaml: string, key: string): string | null {
  const lines = yaml.split('\n')
  const keyPrefix = `${key}:`
  let startIdx = -1
  let baseIndent = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const stripped = line.trimStart()
    if (
      stripped.startsWith(keyPrefix) &&
      (line[0] === key[0] || !line[0]?.trim())
    ) {
      const indent = line.length - stripped.length
      if (baseIndent === -1 || indent === 0) {
        startIdx = i + 1
        baseIndent = indent
        break
      }
    }
  }

  if (startIdx === -1) return null

  const blockLines: string[] = []
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim().length === 0) {
      blockLines.push(line)
      continue
    }
    const indent = line.length - line.trimStart().length
    if (indent <= baseIndent) break
    blockLines.push(line)
  }

  return blockLines.join('\n')
}

// ── checkDecisionCoverage ──────────────────────────────────────────────────

/**
 * Check that every D-NN: ID in spec.md's <decisions> block is listed in
 * plan.md's covered_decisions frontmatter field.
 *
 * Returns { passed: true } when all spec decisions are covered (or when
 * the spec has no decisions block).
 * Returns { passed: false, missing: [...] } when any spec ID is absent
 * from the plan's covered_decisions.
 */
export function checkDecisionCoverage(
  specContent: string,
  planContent: string,
): DecisionCoverageResult {
  const specIds = extractDecisionIds(specContent)
  const coveredIds = extractCoveredDecisions(planContent)

  if (specIds.length === 0) {
    return { passed: true, missing: [], specIds, coveredIds }
  }

  const coveredSet = new Set(coveredIds)
  const missing = specIds.filter((id) => !coveredSet.has(id))

  return {
    passed: missing.length === 0,
    missing,
    specIds,
    coveredIds,
  }
}
