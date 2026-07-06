/**
 * Gate-check logic for workflow-guard (Plan 43 Phase D).
 *
 * Per-gate evaluation against spec.md / plan.md / .anvil/state.json. Pure
 * relative to the filesystem; no env mutations. The set of hard-block gates
 * is derived from WorkflowConfig flags.
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { planPath, specPath } from '../../../core/sdd/feature-paths.js'
import type { WorkflowConfig } from '../../../core/types.js'
import { checkDecisionCoverage } from '../../../intent/decision-coverage.js'
import { checkResearchGate } from '../../../intent/research-gate.js'

export interface GateViolation {
  gate: string
  message: string
}

export async function checkAllGates(
  cwd: string,
  featureSlug: string,
  config: WorkflowConfig,
): Promise<GateViolation[]> {
  const violations: GateViolation[] = []

  const specFilePath = join(cwd, specPath(featureSlug))
  const planFilePath = join(cwd, planPath(featureSlug))
  const hasSpec = existsSync(specFilePath)
  const hasPlan = existsSync(planFilePath)

  // ── research_gate ──────────────────────────────────────────────────────
  if (config.research_gate) {
    if (!hasSpec) {
      violations.push({
        gate: 'research_gate',
        message: `research_gate: spec.md missing for feature "${featureSlug}". Invoke /sdd-workflow to create the spec first.`,
      })
    } else {
      let specContent = ''
      try {
        specContent = await readFile(specFilePath, 'utf-8')
      } catch {
        /* gate passes if file unreadable */
      }
      if (specContent) {
        const result = checkResearchGate(specContent)
        if (!result.passed) {
          violations.push({
            gate: 'research_gate',
            message: `research_gate: spec.md has unresolved Open Questions for feature "${featureSlug}":\n${result.blockers.map((b) => `  - ${b}`).join('\n')}\nResolve all questions in the spec before proceeding (or pass --force on \`anvil plan\` to override).`,
          })
        }
      }
    }
  }

  // ── plan_check ─────────────────────────────────────────────────────────
  if (config.plan_check) {
    if (!hasPlan) {
      violations.push({
        gate: 'plan_check',
        message: `plan_check: plan.md missing for feature "${featureSlug}". Run \`anvil plan --feature ${featureSlug}\` to create the plan.`,
      })
    }
  }

  // ── decision_coverage ──────────────────────────────────────────────────
  if (config.decision_coverage && hasSpec && hasPlan) {
    let specContent = ''
    let planContent = ''
    try {
      specContent = await readFile(specFilePath, 'utf-8')
      planContent = await readFile(planFilePath, 'utf-8')
    } catch {
      /* ignore read errors */
    }
    if (specContent && planContent) {
      const result = checkDecisionCoverage(specContent, planContent)
      if (!result.passed) {
        violations.push({
          gate: 'decision_coverage',
          message: `decision_coverage: plan.md is missing coverage for decisions: ${result.missing.join(', ')}. Add them to \`covered_decisions:\` in plan.md frontmatter.`,
        })
      }
    }
  }

  // verification + context_coverage are advisory in v0.10.x; no violations here.

  return violations
}

export function hardGatesFromConfig(config: WorkflowConfig): Set<string> {
  const hardGates = new Set<string>()
  if (config.research_gate) hardGates.add('research_gate')
  if (config.plan_check) hardGates.add('plan_check')
  if (config.decision_coverage) hardGates.add('decision_coverage')
  if (config.verification) hardGates.add('verification')
  if (config.context_coverage) hardGates.add('context_coverage')
  return hardGates
}

export function buildRedirectMessage(violation: GateViolation): string {
  return `<system-reminder>
WORKFLOW GATE BLOCKED: ${violation.gate}

${violation.message}

This is a hard block. The workflow-guard has prevented continuation because
a required artifact or gate condition is not satisfied.

To bypass: set ANVIL_FORCE=1 for this invocation only.
</system-reminder>`
}
