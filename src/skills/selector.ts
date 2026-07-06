import type { SkillRegistry } from '../core/registry/skill-registry.js'
import type { ProjectContext, Skill } from '../core/types.js'
import { INTENT_DEFINITIONS, type IntentName } from '../intent/intents.js'
import { filterSkillsByActivation } from './activation.js'

const KIND_WEIGHT: Record<Skill['frontmatter']['kind'] & string, number> = {
  meta: 3,
  composite: 2,
  atomic: 1,
}

export interface SelectSkillsOptions {
  /**
   * Current routing intent (e.g. 'debug', 'test', 'review'). When set, any
   * skill listed in `INTENT_DEFINITIONS[intent].defaultSkills` receives a
   * +3 boost so intent-aligned skills rise above pure keyword hits.
   */
  intent?: IntentName
}

export function selectSkills(
  prompt: string,
  registry: SkillRegistry,
  context: ProjectContext,
  options: SelectSkillsOptions = {},
): Skill[] {
  const promptLc = prompt.toLowerCase()
  const detectedLangs = new Set(context.languages.map((l) => l.name))
  const scored: Array<{
    skill: Skill
    score: number
    isLangOverlay: boolean
  }> = []

  const intentBoostSet = options.intent
    ? new Set(INTENT_DEFINITIONS[options.intent].defaultSkills)
    : null

  // ANV-0122 — apply declarative activation pre-filter before scoring.
  // Skills without an activation block are always retained. Logging the
  // reduction lands under ANVIL_VERBOSE only so quiet routing stays quiet.
  const allRegistered = registry.getAll()
  const { kept, excluded } = filterSkillsByActivation(allRegistered, {
    languages: [...detectedLangs],
  })
  if (excluded.length > 0 && process.env.ANVIL_VERBOSE) {
    console.warn(
      `[anvil:selector] activation pre-filter excluded ${excluded.length}/${allRegistered.length} skills`,
    )
  }

  for (const skill of kept) {
    // Skills with disable-model-invocation: true are never auto-routed.
    if (skill.frontmatter.disableModelInvocation) continue

    let score = 0

    // Trigger matching: each matching trigger adds +1 (before language multiplier)
    let triggerMatches = 0
    for (const trigger of skill.frontmatter.trigger) {
      if (promptLc.includes(trigger.toLowerCase())) triggerMatches++
    }

    // Tag matching: each tag that exactly matches a word in the prompt adds +2.
    // Tags must be single words (enforced by the Zod schema refine); multi-word
    // phrases belong in aliases instead.
    const promptWords = new Set(promptLc.split(/\W+/).filter(Boolean))
    for (const tag of skill.frontmatter.tags) {
      if (promptWords.has(tag.toLowerCase())) score += 2
    }

    // Alias matching: each alias that is a substring of the prompt adds +1.
    // Aliases may be multi-word phrases.
    for (const alias of skill.frontmatter.aliases) {
      if (promptLc.includes(alias.toLowerCase())) score += 1
    }

    // Description-trigger match (T2.12): when the prompt matched a trigger
    // AND that trigger phrase appears as a whole word/phrase in the skill's
    // description, add +1. Whole-word matching avoids tautological hits on
    // skills whose name-as-description superstring contains a trigger
    // (e.g. description "planning" embedding trigger "plan").
    if (triggerMatches > 0) {
      const descLc = skill.frontmatter.description.toLowerCase()
      for (const trigger of skill.frontmatter.trigger) {
        const triggerLc = trigger.toLowerCase()
        if (!promptLc.includes(triggerLc)) continue
        const pattern = new RegExp(
          `\\b${triggerLc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
        )
        if (pattern.test(descLc)) {
          score += 1
          break
        }
      }
    }

    // Intent boost (T2.12): +3 if the current intent names this skill in
    // its default bundle.
    if (intentBoostSet?.has(skill.frontmatter.name)) score += 3

    if (triggerMatches === 0 && score === 0) continue

    // Language multiplier applies only to trigger matches, not tags/aliases.
    // Tags and aliases are intent signals independent of detected language.
    const isLangOverlay =
      skill.frontmatter.language !== 'universal' &&
      detectedLangs.has(skill.frontmatter.language)
    score += triggerMatches * (isLangOverlay ? 2 : 1)

    scored.push({ skill, score, isLangOverlay })
  }

  // Dedupe: language overlay wins over universal with same name
  const byName = new Map<
    string,
    { skill: Skill; score: number; isLangOverlay: boolean }
  >()
  for (const entry of scored) {
    const existing = byName.get(entry.skill.frontmatter.name)
    if (!existing || entry.score > existing.score) {
      byName.set(entry.skill.frontmatter.name, entry)
    }
  }

  return [...byName.values()]
    .sort((a, b) => {
      // Primary: score descending.
      if (a.score !== b.score) return b.score - a.score
      // Tiebreak 1: kind (meta > composite > atomic).
      // ANV-0206: kind may be undefined (post-migration x-anvil location); default to 'atomic'.
      const kindA = KIND_WEIGHT[a.skill.frontmatter.kind ?? 'atomic']
      const kindB = KIND_WEIGHT[b.skill.frontmatter.kind ?? 'atomic']
      if (kindA !== kindB) return kindB - kindA
      // Tiebreak 2: language overlay wins over universal.
      if (a.isLangOverlay !== b.isLangOverlay) {
        return a.isLangOverlay ? -1 : 1
      }
      // Tiebreak 3: alphabetical by name for determinism.
      return a.skill.frontmatter.name.localeCompare(b.skill.frontmatter.name)
    })
    .map((e) => e.skill)
}
