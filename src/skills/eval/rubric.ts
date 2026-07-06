import type { Skill } from '../../core/types.js'
import { getSkillBody } from '../body.js'
import type { AxisName, AxisScore, RubricResult } from './types.js'

/**
 * Heuristic 5-axis skill rubric (T2.16).
 *
 * Deterministic structural check that any skill author can reason about —
 * fast, side-effect-free, runnable in CI. Each axis scored 0–2; max 10.
 */

function scoreTriggerClarity(skill: Skill): AxisScore {
  const desc = skill.frontmatter.description
  const startsWithUseWhen = /^use when\b/i.test(desc.trim())
  const triggerCount = skill.frontmatter.trigger.length
  if (startsWithUseWhen && triggerCount >= 3) {
    return {
      axis: 'trigger-clarity',
      score: 2,
      note: 'description starts with "Use when…" and ≥3 triggers',
    }
  }
  if (startsWithUseWhen || triggerCount >= 3) {
    return {
      axis: 'trigger-clarity',
      score: 1,
      note: startsWithUseWhen
        ? '"Use when…" phrasing present but fewer than 3 triggers'
        : '≥3 triggers but description does not start with "Use when…"',
    }
  }
  return {
    axis: 'trigger-clarity',
    score: 0,
    note: 'no "Use when…" phrasing and fewer than 3 triggers',
  }
}

function scoreChecklistPresence(body: string): AxisScore {
  const hasNumberedList = /^\s*\d+\.\s+\S/m.test(body)
  const hasBulletList = /^\s*[-*]\s+\S/m.test(body)
  if (hasNumberedList) {
    return {
      axis: 'checklist-presence',
      score: 2,
      note: 'numbered checklist present',
    }
  }
  if (hasBulletList) {
    return {
      axis: 'checklist-presence',
      score: 1,
      note: 'bulleted list present (no numbered checklist)',
    }
  }
  return {
    axis: 'checklist-presence',
    score: 0,
    note: 'no checklist / list structure found',
  }
}

function scoreRedFlagTable(body: string): AxisScore {
  const hasTable = /\|.+\|\s*\n\|\s*-+/m.test(body)
  const hasRedFlagHeading =
    /red flags?|thoughts that mean stop|stop signal/i.test(body)
  if (hasTable && hasRedFlagHeading) {
    return {
      axis: 'red-flag-table',
      score: 2,
      note: 'red-flag heading + explicit markdown table',
    }
  }
  if (hasRedFlagHeading) {
    return {
      axis: 'red-flag-table',
      score: 1,
      note: 'red-flag heading present but no markdown table',
    }
  }
  return {
    axis: 'red-flag-table',
    score: 0,
    note: 'no red-flag / stop-signal section',
  }
}

function scoreExitCondition(body: string): AxisScore {
  const hasExitHeading =
    /exit condition|done when|definition of done|terminal marker/i.test(body)
  if (hasExitHeading) {
    return {
      axis: 'exit-condition',
      score: 2,
      note: 'explicit exit-condition / done-when section',
    }
  }
  const hasWeakExit = /complete when|ready when/i.test(body)
  if (hasWeakExit) {
    return {
      axis: 'exit-condition',
      score: 1,
      note: 'partial exit criteria found',
    }
  }
  return {
    axis: 'exit-condition',
    score: 0,
    note: 'no exit condition specified',
  }
}

function scoreEvidencePolicy(body: string): AxisScore {
  const hasEvidence = /evidence|verify|verification|proof|cite|concrete/i.test(
    body,
  )
  const hasArtifactRefs =
    /file path|line number|commit hash|test name|command output|`[a-z0-9/_.-]+`/i.test(
      body,
    )
  if (hasEvidence && hasArtifactRefs) {
    return {
      axis: 'evidence-policy',
      score: 2,
      note: 'evidence language + concrete artifact examples',
    }
  }
  if (hasEvidence || hasArtifactRefs) {
    return {
      axis: 'evidence-policy',
      score: 1,
      note: hasEvidence
        ? 'evidence language without concrete artifact examples'
        : 'artifact examples without evidence framing',
    }
  }
  return {
    axis: 'evidence-policy',
    score: 0,
    note: 'no evidence / verification language',
  }
}

export const AXIS_NAMES: AxisName[] = [
  'trigger-clarity',
  'checklist-presence',
  'red-flag-table',
  'exit-condition',
  'evidence-policy',
]

export async function evaluateRubric(skill: Skill): Promise<RubricResult> {
  const body = await getSkillBody(skill)
  const axisScores: AxisScore[] = [
    scoreTriggerClarity(skill),
    scoreChecklistPresence(body),
    scoreRedFlagTable(body),
    scoreExitCondition(body),
    scoreEvidencePolicy(body),
  ]
  const total = axisScores.reduce((sum, a) => sum + a.score, 0)
  const findings = axisScores
    .filter((a) => a.score < 2)
    .map((a) => ({
      axis: a.axis,
      severity: a.score === 0 ? ('warn' as const) : ('info' as const),
      note: a.note,
    }))
  return {
    skill: skill.frontmatter.name,
    total,
    axisScores,
    findings,
  }
}
