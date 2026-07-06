export interface RoutingFixture {
  prompt: string
  shouldMatch: boolean
  description?: string
}

export interface ContentFixture {
  contains: string
  description?: string
}

export interface SkillFixtures {
  routing: RoutingFixture[]
  content: ContentFixture[]
}

export interface EvalResult {
  skill: string
  total: number
  passed: number
  failed: number
  score: number
  details: Array<{
    type: 'routing' | 'content'
    description: string
    passed: boolean
    message: string
  }>
}

// ─── Rubric-based evaluation (v2, T2.16) ──────────────────────────────────

/**
 * The canonical 5 axes a skill is scored on (architecture §6.2.1).
 * Each axis is 0–2: 0 = missing, 1 = present-but-weak, 2 = strong. Max 10.
 */
export type AxisName =
  | 'trigger-clarity'
  | 'checklist-presence'
  | 'red-flag-table'
  | 'exit-condition'
  | 'evidence-policy'

export interface AxisScore {
  axis: AxisName
  score: 0 | 1 | 2
  note: string
}

export interface RubricResult {
  skill: string
  /** 0–10 total across the five axes. */
  total: number
  axisScores: AxisScore[]
  findings: Array<{
    axis: AxisName
    severity: 'info' | 'warn'
    note: string
  }>
}
