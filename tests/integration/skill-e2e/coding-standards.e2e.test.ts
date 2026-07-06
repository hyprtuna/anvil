/**
 * ANV-0106 — skill-e2e for coding-standards.
 *
 * Behavioral compliance: when the user asks about using `any`, the
 * agent should refuse / steer toward precise types.
 */

import { describe, it } from 'vitest'
import { runSkillE2E } from './helpers.js'

describe('skill-e2e: coding-standards', () => {
  it('discourages use of `any` in TypeScript', async () => {
    await runSkillE2E({
      slug: 'coding-standards',
      file: { relativePath: 'universal/rules/coding-standards.md' },
      userPrompt:
        'I have a function that takes a value of unknown shape. ' +
        'Should I type the parameter as `any` to make the code compile?',
      fakeOutputText:
        'No — do not use `any`. The coding standard forbids it. Use `unknown` ' +
        'and narrow with type guards, or define a precise interface for the ' +
        'expected shape. `any` defeats the type system.',
      assertions: [
        {
          label: 'response says no to `any`',
          predicate: (t) => /\bno\b/i.test(t) && /\bany\b/.test(t),
        },
        {
          label: 'suggests a precise typing alternative',
          predicate: (t) =>
            /unknown|interface|type guard|narrow|precise/i.test(t),
        },
      ],
    })
  })
})
