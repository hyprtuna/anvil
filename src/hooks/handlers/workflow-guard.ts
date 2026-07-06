/**
 * workflow-guard handler — Plan 36 Phase E (refactored Plan 43 Phase D).
 *
 * Detects file modifications outside an active workflow context. Reads
 * WorkflowConfig and enforces per-gate hard-blocks (exit 2) when gate=true
 * and artifact missing.
 *
 * Helpers live under `./workflow-guard/`:
 *   source-detect.ts — non-source-file pattern matching
 *   config.ts        — WorkflowConfig loader (advisory fallback)
 *   gates.ts         — per-gate evaluation, hard-gate set, redirect message
 *
 * Gate map:
 *  research_gate     → spec.md ## Open Questions must be empty
 *  plan_check        → plan.md must exist
 *  decision_coverage → spec D-NN: ⊆ plan covered_decisions
 *  verification      → verify phase completed in state.json (advisory in v0.10.x)
 *  context_coverage  → context coverage satisfied (advisory in v0.10.x)
 *
 * ANVIL_FORCE=1: bypasses ALL hard gates for this invocation (logs warning).
 * Config parse failure: falls back to advisory mode (no crash, no exit 2).
 * No active feature (feature_slug null): all gates are inert.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readState } from '../../core/sdd/state-store.js'
import type { HookHandler, HookResult } from '../../core/types.js'
import { createSystemDirective } from '../system-directive.js'
import { loadWorkflowConfig } from './workflow-guard/config.js'
import {
  buildRedirectMessage,
  checkAllGates,
  hardGatesFromConfig,
} from './workflow-guard/gates.js'
import { isSourceFile } from './workflow-guard/source-detect.js'

function legacyAdvisoryResult(
  filePath: string,
  hasLegacyActiveWorkflow: boolean,
): HookResult {
  if (hasLegacyActiveWorkflow) {
    return {
      exitCode: 0,
      message: `workflow-guard: ${filePath} — active workflow detected`,
      context: {
        filePath,
        isSourceFile: true,
        hasActiveWorkflow: true,
        severity: 'ok',
      },
    }
  }
  return {
    exitCode: 1,
    message: `workflow-guard: WARNING — editing source file ${filePath} without an active workflow. Consider using \`anvil quick\` or a proper skill for tracked changes.`,
    context: {
      filePath,
      isSourceFile: true,
      hasActiveWorkflow: false,
      severity: 'warning',
    },
  }
}

export const workflowGuardHandler: HookHandler = async (ctx) => {
  const payload = ctx.payload as { filePath?: string } | null
  const filePath = payload?.filePath ?? ''

  if (!filePath) {
    return { exitCode: 0, message: 'workflow-guard: no file path provided' }
  }

  if (!isSourceFile(filePath)) {
    return {
      exitCode: 0,
      message: `workflow-guard: ${filePath} — config/docs file, no workflow required`,
      context: { filePath, isSourceFile: false, severity: 'ok' },
    }
  }

  const legacyWorkflowPath = join(
    ctx.cwd,
    '.anvil',
    'state',
    'active-workflow.json',
  )
  const hasLegacyActiveWorkflow = existsSync(legacyWorkflowPath)

  const { config, parseError } = await loadWorkflowConfig(ctx.cwd)

  if (parseError) {
    process.stderr.write(
      `[anvil:workflow-guard] config parse error (falling back to advisory): ${parseError}\n`,
    )
    return legacyAdvisoryResult(filePath, hasLegacyActiveWorkflow)
  }

  const isForced =
    ctx.env.ANVIL_FORCE === '1' || process.env.ANVIL_FORCE === '1'

  let featureSlug: string | undefined
  try {
    const state = await readState(ctx.cwd)
    featureSlug = state.feature_slug
  } catch {
    featureSlug = undefined
  }

  if (!featureSlug) {
    return legacyAdvisoryResult(filePath, hasLegacyActiveWorkflow)
  }

  if (isForced) {
    const bypassMsg = `workflow-guard: ANVIL_FORCE=1 — bypassing hard gates for feature "${featureSlug}". This bypass is logged.`
    process.stderr.write(`[anvil:workflow-guard] ${bypassMsg}\n`)
    return {
      exitCode: 0,
      message: bypassMsg,
      context: {
        filePath,
        isSourceFile: true,
        featureSlug,
        forced: true,
        severity: 'ok',
      },
    }
  }

  const violations = await checkAllGates(ctx.cwd, featureSlug, config)

  if (violations.length > 0) {
    const hardGates = hardGatesFromConfig(config)
    const hardViolations = violations.filter((v) => hardGates.has(v.gate))
    const softViolations = violations.filter((v) => !hardGates.has(v.gate))

    if (hardViolations.length > 0) {
      const allMessages = hardViolations.map((v) => v.message).join('\n\n')
      const redirect = buildRedirectMessage(hardViolations[0])
      return {
        exitCode: 2,
        message: `workflow-guard: HARD BLOCK — ${allMessages}\n\nUse ANVIL_FORCE=1 to bypass for this invocation.`,
        systemInsert: createSystemDirective('ADVISORY', redirect),
        context: {
          filePath,
          isSourceFile: true,
          featureSlug,
          violations: hardViolations.map((v) => v.gate),
          severity: 'error',
        },
      }
    }

    const softMessages = softViolations.map((v) => v.message).join('\n')
    return {
      exitCode: 1,
      message: `workflow-guard: advisory — ${softMessages}`,
      context: {
        filePath,
        isSourceFile: true,
        featureSlug,
        violations: softViolations.map((v) => v.gate),
        severity: 'warning',
      },
    }
  }

  return {
    exitCode: 0,
    message: `workflow-guard: ${filePath} — feature "${featureSlug}" gates satisfied`,
    context: {
      filePath,
      isSourceFile: true,
      featureSlug,
      hasActiveWorkflow: true,
      severity: 'ok',
    },
  }
}
