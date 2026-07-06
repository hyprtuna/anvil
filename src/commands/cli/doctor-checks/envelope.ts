interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
  alwaysVisible?: boolean
}

/**
 * B6c: Dry-run — dispatch a sample directive prompt through the
 * user-prompt-submit handler and verify the additionalContext envelope
 * is generated.
 */
export async function pushEnvelopeDryRunCheck(
  checks: Check[],
  cwd: string,
): Promise<void> {
  try {
    const { userPromptSubmitHandler } = await import(
      '../../../hooks/handlers/user-prompt-submit.js'
    )
    const { buildDefaultConfig } = await import(
      '../../../core/config/defaults.js'
    )
    const result = await userPromptSubmitHandler({
      kind: 'user-prompt-submit',
      cwd,
      config: buildDefaultConfig(),
      env: { ANVIL_ROUTING_BANNER: 'off' },
      payload: 'debug this null pointer exception',
    })
    if (result.systemInsert !== undefined && result.systemInsert.length > 0) {
      checks.push({
        name: 'additionalContext envelope dry-run',
        status: 'pass',
        detail: `systemInsert generated (${result.systemInsert.length} chars)`,
      })
    } else {
      checks.push({
        name: 'additionalContext envelope dry-run',
        status: 'warn',
        detail:
          'sample directive prompt did not generate systemInsert — check router thresholds',
      })
    }
  } catch (err) {
    checks.push({
      name: 'additionalContext envelope dry-run',
      status: 'fail',
      detail: `dry-run threw: ${(err as Error).message}`,
    })
  }
}
