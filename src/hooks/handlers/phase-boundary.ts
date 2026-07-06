import type { HookHandler } from '../../core/types.js'

/**
 * Detects edits to planning/state artifacts outside defined workflows.
 * Advisory only — warns but never blocks (exitCode 0 or 1, never 2).
 * Disabled by default — opt in via config.
 */
export const phaseBoundaryHandler: HookHandler = async (ctx) => {
  const payload = ctx.payload as {
    filePath?: string
    content?: string
  } | null

  const filePath = payload?.filePath ?? ''

  if (!filePath) {
    return { exitCode: 0, message: 'phase-boundary: no file path provided' }
  }

  // Protected path patterns — planning and state artifacts
  // ANV-0131: plans moved from docs/anvil/plans/ to .anvil/_archive/docs-anvil/plans/
  const protectedPatterns = [
    '.anvil/_archive/docs-anvil/plans/',
    '.anvil/specs/features/',
    '.anvil/state/',
    'PLAN.md',
    'SPEC.md',
    'ARCHITECTURE.md',
  ]

  const isProtected = protectedPatterns.some((p) => filePath.includes(p))

  if (isProtected) {
    return {
      exitCode: 1,
      message: `phase-boundary: WARNING — editing planning artifact ${filePath} outside a planning skill. Use a planning skill for tracked changes.`,
      context: { filePath, severity: 'warning' },
    }
  }

  return {
    exitCode: 0,
    message: `phase-boundary: ${filePath} — not a protected path`,
    context: { filePath, severity: 'ok' },
  }
}
