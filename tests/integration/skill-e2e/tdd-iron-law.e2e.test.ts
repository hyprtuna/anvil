/**
 * ANV-0106 — skill-e2e for tdd-iron-law.
 *
 * Behavioral compliance: when the user asks to add a feature with the
 * tdd-iron-law skill loaded, the agent should mention writing a
 * failing test first.
 */

import { describe, it } from 'vitest'
import { runSkillE2E } from './helpers.js'

const hasFailingTestPhrase = (text: string): boolean => {
  const lower = text.toLowerCase()
  return (
    (lower.includes('fail') && lower.includes('test')) ||
    lower.includes('red before green') ||
    lower.includes('write the test first')
  )
}

describe('skill-e2e: tdd-iron-law', () => {
  it('mentions writing a failing test first when adding a feature', async () => {
    await runSkillE2E({
      slug: 'tdd-iron-law',
      file: { relativePath: 'universal/rules/tdd-iron-law.md' },
      userPrompt:
        'I want to add a new feature that validates user email format. How should I start?',
      fakeOutputText:
        'Write a failing test first. The TDD iron law says red before green: ' +
        'create the test that exercises email validation, run it and watch it ' +
        'fail, then implement the validator until the test passes.',
      assertions: [
        {
          label: 'mentions writing a failing test before implementation',
          predicate: hasFailingTestPhrase,
        },
      ],
    })
  })
})
