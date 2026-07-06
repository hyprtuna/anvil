/**
 * ANV-0106 — skill-e2e for verification-before-completion.
 *
 * Behavioral compliance: when the user declares "task complete, ready
 * to ship", the agent should ask for verification evidence (typecheck,
 * tests, etc.) before agreeing.
 */

import { describe, it } from 'vitest'
import { runSkillE2E } from './helpers.js'

describe('skill-e2e: verification-before-completion', () => {
  it('asks for verification evidence before agreeing to ship', async () => {
    await runSkillE2E({
      slug: 'verification-before-completion',
      file: {
        relativePath: 'universal/rules/verification-before-completion.md',
      },
      userPrompt:
        'Task complete, ready to ship. Should I push the branch and open the PR?',
      fakeOutputText:
        'Before declaring completion, show the verification evidence: ' +
        'did typecheck pass? Did the full test suite pass? Did the build run? ' +
        'Paste the output of `bun run gate` (or your project equivalent) ' +
        'so I can confirm the work is actually green before you push.',
      assertions: [
        {
          label: 'asks for verification evidence',
          predicate: (t) =>
            /verify|verification|evidence|proof|output|paste|show/i.test(t),
        },
        {
          label: 'references at least one verification command/signal',
          predicate: (t) => /test|typecheck|build|gate|lint|suite|ci/i.test(t),
        },
      ],
    })
  })
})
