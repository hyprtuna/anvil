import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { INTENT_DEFINITIONS } from '../../../src/intent/intents.js'
import type { IntentName } from '../../../src/intent/intents.js'
import { detectIntents, route } from '../../../src/intent/router.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = join(
  __dirname,
  '..',
  '..',
  'fixtures',
  'intent-prompts.json',
)

interface Fixture {
  description: string
  minimumAccuracy: number
  prompts: Array<{ prompt: string; expected: string }>
}

interface Metrics {
  intent: IntentName
  support: number
  truePositive: number
  falsePositive: number
  falseNegative: number
  precision: number
  recall: number
  f1: number
}

const ALL_SKILLS = new Set(
  Object.values(INTENT_DEFINITIONS).flatMap((d) => d.defaultSkills),
)
const ALL_AGENTS = new Set(
  Object.values(INTENT_DEFINITIONS).map((d) => d.defaultAgent),
)
const REGISTRY = { availableSkills: ALL_SKILLS, availableAgents: ALL_AGENTS }

function loadFixture(): Fixture {
  const raw = readFileSync(FIXTURE_PATH, 'utf8')
  return JSON.parse(raw) as Fixture
}

function computeMetrics(
  results: Array<{ expected: IntentName; actual: IntentName }>,
): Metrics[] {
  const intents = new Set(results.map((r) => r.expected))
  const out: Metrics[] = []
  for (const intent of intents) {
    const tp = results.filter(
      (r) => r.expected === intent && r.actual === intent,
    ).length
    const fp = results.filter(
      (r) => r.expected !== intent && r.actual === intent,
    ).length
    const fn = results.filter(
      (r) => r.expected === intent && r.actual !== intent,
    ).length
    const support = results.filter((r) => r.expected === intent).length
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
    const f1 =
      precision + recall === 0
        ? 0
        : (2 * precision * recall) / (precision + recall)
    out.push({
      intent,
      support,
      truePositive: tp,
      falsePositive: fp,
      falseNegative: fn,
      precision,
      recall,
      f1,
    })
  }
  return out.sort((a, b) => b.f1 - a.f1)
}

function formatTable(metrics: Metrics[], overall: number): string {
  const lines: string[] = []
  lines.push('')
  lines.push(
    `${'intent'.padEnd(18)}${'support'.padStart(8)}${'precision'.padStart(12)}${'recall'.padStart(10)}${'f1'.padStart(8)}`,
  )
  lines.push('-'.repeat(56))
  for (const m of metrics) {
    lines.push(
      `${m.intent.padEnd(18)}${String(m.support).padStart(8)}${m.precision.toFixed(2).padStart(12)}${m.recall.toFixed(2).padStart(10)}${m.f1.toFixed(2).padStart(8)}`,
    )
  }
  lines.push('-'.repeat(56))
  lines.push(`overall accuracy  ${overall.toFixed(2)}`)
  lines.push('')
  return lines.join('\n')
}

describe('intent/router — eval harness', () => {
  const fixture = loadFixture()

  it('ships at least 50 labeled prompts with ≥ 4 per non-veto intent', () => {
    const nonVeto = fixture.prompts.filter((p) => !p.expected.startsWith('_'))
    expect(nonVeto.length).toBeGreaterThanOrEqual(50)

    const perIntent = new Map<string, number>()
    for (const p of nonVeto) {
      perIntent.set(p.expected, (perIntent.get(p.expected) ?? 0) + 1)
    }
    const thin = [...perIntent.entries()].filter(([, n]) => n < 4)
    expect(
      thin,
      `intents with fewer than 4 fixtures:\n${thin
        .map(([i, n]) => `  - ${i}: ${n}`)
        .join('\n')}`,
    ).toEqual([])
  })

  it(`achieves at least ${fixture.minimumAccuracy} overall accuracy`, () => {
    const nonVeto = fixture.prompts.filter((p) => !p.expected.startsWith('_'))
    const results = nonVeto.map((p) => ({
      prompt: p.prompt,
      expected: p.expected as IntentName,
      actual: route(p.prompt, REGISTRY).intent as IntentName,
    }))
    const correct = results.filter((r) => r.expected === r.actual).length
    const accuracy = correct / results.length

    const metrics = computeMetrics(results)
    // Always print the table so the CI log shows the current shape.
    console.log(formatTable(metrics, accuracy))

    if (accuracy < fixture.minimumAccuracy) {
      const failures = results
        .filter((r) => r.expected !== r.actual)
        .map(
          (r) => `  "${r.prompt}" — expected=${r.expected} actual=${r.actual}`,
        )
        .join('\n')
      throw new Error(
        `router accuracy ${accuracy.toFixed(2)} below floor ${fixture.minimumAccuracy}.\nMisroutes:\n${failures}`,
      )
    }
    expect(accuracy).toBeGreaterThanOrEqual(fixture.minimumAccuracy)
  })

  it('vetoes negative-pattern prompts (does not detect the vetoed intent)', () => {
    const vetos = fixture.prompts.filter((p) => p.expected.startsWith('_veto:'))
    expect(vetos.length).toBeGreaterThan(0)
    for (const v of vetos) {
      const vetoedIntent = v.expected.slice('_veto:'.length) as IntentName
      const detected = detectIntents(v.prompt)
      const match = detected.find((d) => d.intent === vetoedIntent)
      expect(
        match,
        `expected ${vetoedIntent} to be vetoed for prompt "${v.prompt}"`,
      ).toBeUndefined()
    }
  })
})
