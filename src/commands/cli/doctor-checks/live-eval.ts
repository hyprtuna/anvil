import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ANV-0045 — Handle `anvil doctor --live`.
 *
 * Without `ANVIL_LIVE_EVAL=1`, prints an explanatory message and returns.
 * With the env var set, logs that actual Claude subprocess invocation is
 * out of scope for this ticket (scaffold/gate only).
 *
 * @param userInvocableNames - Slugs to eval (from the loaded registry).
 * @param fixturesDir - Absolute path to `tests/skill-triggering/fixtures/`.
 */
export async function runLiveSkillEval(
  userInvocableNames: string[],
  fixturesDir: string,
): Promise<void> {
  if (process.env.ANVIL_LIVE_EVAL !== '1') {
    process.stdout.write(
      [
        '',
        '  anvil doctor --live requires ANVIL_LIVE_EVAL=1 to prevent',
        '  unintended token spend. Re-run with:',
        '',
        '    ANVIL_LIVE_EVAL=1 anvil doctor --live',
        '',
      ].join('\n'),
    )
    return
  }

  // Gate is open — report fixture coverage per skill.
  // NOTE: Actual Claude subprocess invocation is out of scope for ANV-0045.
  // The follow-on ticket will spawn a real Claude Code session per skill,
  // feed the fixture prompt, and pass the transcript to validateSkillFiresFirst
  // (from tests/skill-triggering/transcript-validator.ts).
  process.stdout.write('\n  Live skill-triggering eval\n')
  process.stdout.write(
    '  Note: subprocess invocation is a follow-on; reporting fixture coverage.\n\n',
  )

  for (const slug of userInvocableNames) {
    const fixturePath = join(fixturesDir, `${slug}.md`)
    const hasFixture = existsSync(fixturePath)
    if (!hasFixture) {
      process.stdout.write(`  warn  ${slug} — no fixture file\n`)
      continue
    }
    process.stdout.write(
      `  pass  ${slug} — fixture present at ${fixturePath}\n`,
    )
  }
  process.stdout.write('\n')
}
