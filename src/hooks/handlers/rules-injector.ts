import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { HookHandler } from '../../core/types.js'

const RULE_FILES = ['AGENTS.md', 'CLAUDE.md'] as const
const MAX_RULES_BYTES = 8_192

/**
 * Finds the nearest AGENTS.md (preferred) or CLAUDE.md by walking up from
 * `startDir` toward but not past `boundary`. Returns the first path found,
 * or null if none exist within bounds.
 */
function findNearestRulesFile(
  startDir: string,
  boundary: string,
): string | null {
  const absBoundary = resolve(boundary)
  let current = resolve(startDir)

  // Guard: startDir must be within boundary.
  if (!current.startsWith(absBoundary)) return null

  while (true) {
    for (const name of RULE_FILES) {
      const candidate = join(current, name)
      if (existsSync(candidate)) {
        try {
          if (statSync(candidate).isFile()) return candidate
        } catch {
          // ignore and continue
        }
      }
    }
    if (current === absBoundary) return null
    const parent = dirname(current)
    if (parent === current) return null
    // Stop before crossing the boundary upward.
    if (!parent.startsWith(absBoundary)) return null
    current = parent
  }
}

/**
 * Runs after a tool use. If the tool operated on a file, walks upward from
 * that file (bounded by cwd) to find the nearest AGENTS.md / CLAUDE.md and
 * surfaces its contents to the agent via ctx.context.rules.
 *
 * Advisory only — always exitCode 0. Disabled by default.
 *
 * Adopted from oh-my-openagent's src/hooks/rules-injector/ pattern.
 */
export const rulesInjectorHandler: HookHandler = async (ctx) => {
  const payload = ctx.payload as { file?: string } | null
  const file = payload?.file
  if (!file || typeof file !== 'string' || file.length === 0) {
    return { exitCode: 0, message: 'rules-injector: no file in payload' }
  }

  const abs = resolve(file)
  const startDir = dirname(abs)
  const found = findNearestRulesFile(startDir, ctx.cwd)
  if (!found) {
    return { exitCode: 0, message: 'rules-injector: no rules file found' }
  }

  let rules: string
  try {
    rules = readFileSync(found, 'utf8')
  } catch {
    return { exitCode: 0, message: 'rules-injector: failed to read rules' }
  }

  const truncated = rules.length > MAX_RULES_BYTES
  const payloadRules = truncated ? rules.slice(0, MAX_RULES_BYTES) : rules

  const context: Record<string, unknown> = {
    rulesFile: found,
    rules: payloadRules,
  }
  if (truncated) context.rulesTruncated = true

  return {
    exitCode: 0,
    message: `rules-injector: surfaced ${found}`,
    context,
  }
}
