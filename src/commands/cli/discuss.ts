import { resolveAndSyncRuntimeContext } from './common/auto-mode.js'
import { invokeSkill } from './common/invoke.js'

export interface DiscussOptions {
  json?: boolean
  quiet?: boolean
  /**
   * ANV-0176 — opt into decision auto-mode. Honors `ANVIL_AUTO=1` env var
   * when the flag is absent; explicit `--no-auto` overrides the env.
   */
  auto?: boolean
  /**
   * ANV-0176 — broader "trust me, pick the recommended option" override.
   * Honors `ANVIL_AUTO_DEFAULTS=1` env var; explicit
   * `--no-accept-defaults` overrides the env.
   */
  acceptDefaults?: boolean
}

export async function discussCommand(
  topic: string,
  opts: DiscussOptions = {},
): Promise<void> {
  const runtimeContext = resolveAndSyncRuntimeContext({
    auto: opts.auto,
    acceptDefaults: opts.acceptDefaults,
  })
  await invokeSkill(
    'brainstorming',
    `Discussion topic: ${topic}\nCapture decisions, surface gray areas, record locked decisions.`,
    { runtimeContext },
  )
}
