/**
 * ANV-0106 — skill-e2e for code-review.
 *
 * Behavioral compliance: given a small problematic diff, the agent
 * should surface at least one severity-graded finding.
 */

import { describe, it } from 'vitest'
import { runSkillE2E } from './helpers.js'

const SAMPLE_DIFF = `\
diff --git a/src/auth.ts b/src/auth.ts
+export function login(user: any, password: any) {
+  if (password == users[user].password) return true
+  return false
+}
`

describe('skill-e2e: code-review', () => {
  it('surfaces a severity-graded finding on a flawed diff', async () => {
    await runSkillE2E({
      slug: 'code-review',
      file: { relativePath: 'universal/code-review/SKILL.md' },
      userPrompt: `Please review this diff:\n\n${SAMPLE_DIFF}`,
      fakeOutputText:
        'Findings:\n' +
        '- [CRITICAL] Uses == for password comparison — should be timing-safe.\n' +
        '- [HIGH] Both parameters typed `any`; loses the type-safety net.\n' +
        '- [MEDIUM] No handling for missing user (users[user] may be undefined).\n',
      assertions: [
        {
          label: 'response uses severity grading',
          predicate: (t) =>
            /critical|high|medium|low|warning|severity/i.test(t),
        },
        {
          label: 'response cites at least one specific issue',
          predicate: (t) => /==|any|undefined|timing|password/i.test(t),
        },
      ],
    })
  })
})
