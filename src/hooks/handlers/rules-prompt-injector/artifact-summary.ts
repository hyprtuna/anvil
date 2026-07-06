/**
 * Artifact summary + phase-redirect block builders for rules-prompt-injector
 * (Plan 43 Phase F).
 *
 * `buildArtifactSummary` reads `spec.md` + `plan.md` for the active feature
 * and renders a ≤1KB `<system-reminder>` block. `buildSoftRedirectBanner` and
 * `buildHardRedirectBlock` shape phase-matrix redirects.
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { planPath, specPath } from '../../../core/sdd/feature-paths.js'

const MAX_ARTIFACT_BYTES = 1024

async function readTruncated(
  filePath: string,
  maxBytes: number,
): Promise<string | null> {
  try {
    const content = await readFile(filePath, 'utf-8')
    if (content.length <= maxBytes) return content
    return `${content.slice(0, maxBytes)}…\n[truncated — ${content.length} chars total]`
  } catch {
    return null
  }
}

export async function buildArtifactSummary(
  cwd: string,
  featureSlug: string,
): Promise<string | null> {
  const specFilePath = join(cwd, specPath(featureSlug))
  const planFilePath = join(cwd, planPath(featureSlug))

  const specExists = existsSync(specFilePath)
  const planExists = existsSync(planFilePath)
  if (!specExists && !planExists) return null

  const parts: string[] = [
    `<system-reminder name="sdd-artifact-summary" feature="${featureSlug}">`,
  ]

  if (specExists) {
    const specHead = await readTruncated(
      specFilePath,
      Math.floor(MAX_ARTIFACT_BYTES / 2),
    )
    if (specHead) parts.push(`## spec.md (${featureSlug})\n${specHead}`)
  }

  if (planExists) {
    const planHead = await readTruncated(
      planFilePath,
      Math.floor(MAX_ARTIFACT_BYTES / 2),
    )
    if (planHead) parts.push(`## plan.md (${featureSlug})\n${planHead}`)
  }

  parts.push('</system-reminder>')
  return parts.join('\n\n')
}

export function buildSoftRedirectBanner(
  target: 'spec' | 'plan',
  reason: string,
): string {
  return `▶ Anvil suggests: run \`anvil ${target}\` first — ${reason}`
}

export function buildHardRedirectBlock(
  target: 'spec' | 'plan',
  reason: string,
): string {
  return `<system-reminder name="workflow-redirect">
WORKFLOW GATE: run \`anvil ${target}\` before continuing.

${reason}

This is a required workflow step. Complete it, then retry your request.
</system-reminder>`
}
