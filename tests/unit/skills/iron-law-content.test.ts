import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const ironLawSkills = [
  'tdd-iron-law',
  'verification-before-completion',
  'evidence-before-assertion',
] as const

const skillBodies = Object.fromEntries(
  ironLawSkills.map((name) => [
    name,
    readFileSync(`skills/universal/rules/${name}.md`, 'utf-8'),
  ]),
) as Record<(typeof ironLawSkills)[number], string>

describe('skills/universal/rules — iron-law content sweep (Plan 39 Phase A)', () => {
  for (const name of ironLawSkills) {
    describe(name, () => {
      const body = skillBodies[name]

      it('contains a <HARD-GATE> opening tag', () => {
        expect(body).toContain('<HARD-GATE')
      })

      it('contains a closing </HARD-GATE> tag', () => {
        expect(body).toContain('</HARD-GATE>')
      })

      it('contains a `letter = spirit:` line inside the HARD-GATE', () => {
        expect(body).toMatch(/letter\s*=\s*spirit/i)
      })

      it('declares an explicit phase attribute on the HARD-GATE', () => {
        // <HARD-GATE phase="implementation"> | "completion" | "claim"
        expect(body).toMatch(/<HARD-GATE\s+phase="[a-z-]+"/)
      })

      it('contains a 6-row "Red flags" rationalization table', () => {
        // Find the table after "Red flags" heading; count data rows.
        const tableMatch = body.match(
          /## Red flags[\s\S]*?\n\| Thought \| Reality \|[\s\S]*?(?=\n\n|\n## )/,
        )
        expect(
          tableMatch,
          `${name} must have a Red-flags table starting with "| Thought | Reality |"`,
        ).not.toBeNull()
        const tableText = tableMatch![0]
        // Match data rows: lines beginning with `| "` or `| <quote>` (5 = original, 6 = with new row).
        const dataRows = tableText
          .split('\n')
          .filter((line) => /^\|\s*"/.test(line))
        expect(
          dataRows.length,
          `${name} should have ≥ 6 rationalization rows; found ${dataRows.length}`,
        ).toBeGreaterThanOrEqual(6)
      })

      it('preserves the existing structural sections', () => {
        expect(body).toContain('## The rule')
        expect(body).toContain('## When to use')
        expect(body).toContain('## Red flags')
        expect(body).toContain('## Exit condition')
        expect(body).toContain('## Why')
      })

      it('HARD-GATE block lists the lift conditions as a bulleted list', () => {
        // The block should contain "This gate lifts ONLY when:" followed by ≥3 bullets.
        const liftMatch = body.match(
          /This gate lifts ONLY when:\s*\n((?:- [^\n]+\n){3,})/,
        )
        expect(
          liftMatch,
          `${name} must enumerate ≥ 3 lift conditions after "This gate lifts ONLY when:"`,
        ).not.toBeNull()
      })
    })
  }
})
