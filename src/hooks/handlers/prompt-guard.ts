import type {
  HookHandler,
  HookHandlerProfileManifest,
} from '../../core/types.js'
import { matchInjectionPatterns } from '../patterns.js'

/**
 * ANV-0128 — prompt-guard profile manifest.
 *
 * Three operating modes for the injection-pattern scanner:
 *
 *   minimal  — scan only the highest-risk paths (`.claude-plugin/`,
 *              `.opencode/`). Everything else falls through clean.
 *   balanced — DEFAULT. Current 5-path sensitive set
 *              (`.claude-plugin`, `.opencode`, `skills/`, `agents/`, `hooks/`).
 *              Findings produce a warning (exitCode 1). Matches pre-ANV-0128
 *              behavior so existing installs see no change.
 *   strict   — scan every path AND escalate findings to a block (exitCode 2)
 *              instead of a warn. Use in CI / paranoid environments.
 *
 * Selectable per project via `anvil.config.json`:
 *
 *     "hooks": { "prompt-guard": { "profile": "strict" } }
 */
export const promptGuardProfileManifest: HookHandlerProfileManifest = {
  profiles: {
    minimal: {
      description:
        'Scan only `.claude-plugin/` and `.opencode/` — other paths pass through.',
    },
    balanced: {
      description:
        'Current 5-path sensitive set; findings produce a warn (exitCode 1).',
    },
    strict: {
      description:
        'Scan every path; escalate findings to a block (exitCode 2).',
    },
  },
  defaultProfile: 'balanced',
}

type PromptGuardProfile = 'minimal' | 'balanced' | 'strict'

const VALID_PROFILES: ReadonlySet<PromptGuardProfile> = new Set([
  'minimal',
  'balanced',
  'strict',
])

function normaliseProfile(raw: string | undefined): PromptGuardProfile {
  if (raw && (VALID_PROFILES as Set<string>).has(raw)) {
    return raw as PromptGuardProfile
  }
  return 'balanced'
}

const MINIMAL_PATHS = ['.claude-plugin', '.opencode']
const BALANCED_PATHS = [
  '.claude-plugin',
  '.opencode',
  'skills/',
  'agents/',
  'hooks/',
]

/**
 * Returns true when `filePath` should be scanned under the active profile.
 * `strict` scans everything; `balanced` matches the legacy 5-path list;
 * `minimal` only fires on the two highest-risk roots.
 */
function shouldScan(filePath: string, profile: PromptGuardProfile): boolean {
  if (profile === 'strict') return true
  const paths = profile === 'minimal' ? MINIMAL_PATHS : BALANCED_PATHS
  return paths.some((p) => filePath.includes(p))
}

/**
 * Scans file content for prompt injection patterns. Profile selects the
 * scope of paths considered sensitive and whether findings warn or block.
 * Disabled by default — opt in via config.
 */
export const promptGuardHandler: HookHandler = async (ctx) => {
  const payload = ctx.payload as {
    filePath?: string
    content?: string
  } | null

  const filePath = payload?.filePath ?? ''
  const content = payload?.content ?? ''
  // ANV-0128 — read active profile from dispatcher-supplied context.
  const profile = normaliseProfile(ctx.profile)

  if (!shouldScan(filePath, profile) || !content) {
    return {
      exitCode: 0,
      message: `prompt-guard[${profile}]: not a sensitive path`,
    }
  }

  const findings = matchInjectionPatterns(content)

  if (findings.length > 0) {
    // strict — escalate to block; balanced/minimal — warn.
    const exitCode: 1 | 2 = profile === 'strict' ? 2 : 1
    const severity = profile === 'strict' ? 'blocked' : 'warning'
    return {
      exitCode,
      message: `prompt-guard[${profile}]: ${severity === 'blocked' ? 'BLOCKED' : 'WARNING'} — potential injection patterns detected in ${filePath}: ${findings.join(', ')}`,
      context: { filePath, findings, severity, profile },
    }
  }

  return {
    exitCode: 0,
    message: `prompt-guard[${profile}]: ${filePath} — clean`,
    context: { filePath, findings: [], severity: 'ok', profile },
  }
}
