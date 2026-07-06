/**
 * Semantic fallback — Jaccard word-overlap secondary pass (Plan 31 G3).
 *
 * Called by `route()` when the keyword-based intent detection produces no
 * match (or a very low-confidence match below the configured floor). Uses
 * a simple token-level Jaccard similarity between the user prompt and each
 * skill's description / name / disambiguator to surface the closest skill.
 *
 * Design constraints:
 *  - Confidence is **capped at 0.65** so the fallback never triggers a
 *    directive (directive threshold is also 0.65 — using strict `<` keeps
 *    the cap exclusive of directive territory).
 *  - Default Jaccard threshold: 0.3. Tunable via the `threshold` parameter.
 *  - Returns `null` when no skill scores at/above `threshold`.
 */

import type { Skill } from '../core/types.js'

/** Maximum confidence the fallback is allowed to report. */
export const SEMANTIC_FALLBACK_CONFIDENCE_CAP = 0.65

/** Stopwords excluded from token sets to reduce noise. */
const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'is',
  'it',
  'this',
  'that',
  'be',
  'as',
  'are',
  'was',
  'were',
  'has',
  'have',
  'had',
  'do',
  'does',
  'did',
  'not',
  'i',
  'you',
  'we',
  'me',
  'my',
  'your',
  'can',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'its',
  'their',
  'them',
  'they',
  'he',
  'she',
  'if',
  'so',
  'no',
  'up',
  'out',
  'about',
  'what',
  'how',
  'just',
  'more',
])

/**
 * Tokenizes text into a set of lowercase words, dropping stopwords and
 * single-character tokens.
 */
export function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
  return new Set(tokens)
}

/**
 * Computes Jaccard similarity: |intersection| / |union|.
 * Returns 0 when both sets are empty.
 */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersect = 0
  for (const token of a) {
    if (b.has(token)) intersect++
  }
  const union = a.size + b.size - intersect
  return union === 0 ? 0 : intersect / union
}

/**
 * Builds the token set for a skill. Combines name, description, and
 * `originalDescription` (if present from disambiguator prefixing).
 */
function skillTokens(skill: Skill): Set<string> {
  const parts: string[] = [
    skill.frontmatter.name,
    skill.frontmatter.description,
  ]
  if (skill.originalDescription) {
    parts.push(skill.originalDescription)
  }
  return tokenize(parts.join(' '))
}

/**
 * Jaccard-based semantic fallback.
 *
 * @param prompt    The raw user prompt.
 * @param allSkills All registered skills to score against.
 * @param threshold Minimum Jaccard overlap to consider a match (default 0.3).
 * @returns The best-matching skill name and a capped confidence, or `null`
 *          when no skill meets the threshold.
 */
export function semanticFallback(
  prompt: string,
  allSkills: Skill[],
  threshold = 0.3,
): { skill: string; confidence: number } | null {
  const promptTokens = tokenize(prompt)
  if (promptTokens.size === 0) return null

  let bestSkill: string | null = null
  let bestScore = 0

  for (const skill of allSkills) {
    const sTokens = skillTokens(skill)
    const score = jaccard(promptTokens, sTokens)
    if (score > bestScore) {
      bestScore = score
      bestSkill = skill.frontmatter.name
    }
  }

  if (bestScore < threshold || bestSkill === null) return null

  const confidence = Math.min(bestScore, SEMANTIC_FALLBACK_CONFIDENCE_CAP)
  return { skill: bestSkill, confidence }
}
