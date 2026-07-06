/**
 * ANV-0028 (P3) — Validator 5: permission-lint
 *
 * Checks:
 *   1. manifest tools[] within taxonomy (warn for over-grant)
 *   2. policies/*.cedar files syntactically valid via regex (block)
 *   3. hooks.json declared commands within allow-list (block)
 *
 * Severity: block for Cedar/hooks violations, warn for tool over-grant.
 *
 * Layer 0 — reads content/ directory.
 */

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { quarantineDir } from '../quarantine.js'
import type { QuarantineRecord, ValidationOutcome } from '../types.js'
import type { ValidatorContext } from './index.js'

export const PERMISSION_VALIDATOR_ID = 'permission-lint'

/**
 * Allowed tool names for extension manifests.
 * TODO(ANV-0028-followup): enforce once ExtensionManifest gains tools[] field.
 * List kept here for documentation; unused until schema update.
 */
// ALLOWED_TOOLS = ['read_file','write_file','edit_file','bash',...]

/**
 * Allowed hook commands.
 * TODO(ANV-0028-followup): extend once hook command taxonomy is formalised.
 */
const ALLOWED_HOOK_COMMANDS = new Set([
  'anvil',
  'node',
  'bun',
  'python',
  'python3',
  'bash',
  'sh',
  'npx',
  'tsx',
])

/**
 * Minimal regex for Cedar policy syntactic validity.
 * Full semantic parsing deferred per plan §5 rationale.
 * Checks that the file contains a permit/forbid block.
 */
const CEDAR_PERMIT_OR_FORBID_RE = /\b(permit|forbid)\s*\(/

async function safeReadDir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir)
  } catch {
    return []
  }
}

async function safeReadFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8')
  } catch {
    return null
  }
}

export async function validatePermission(
  record: QuarantineRecord,
  ctx: ValidatorContext,
): Promise<ValidationOutcome> {
  const contentPath = join(
    quarantineDir(ctx.anvilHome, record.source.id, record.manifest.name),
    'content',
  )

  const issues: Array<{ severity: 'block' | 'warn'; message: string }> = []

  // 1. Tool taxonomy check (warn for over-grant)
  // ExtensionManifest in our catalog types does not have a tools[] field directly.
  // The tools field may appear in hooks.json or as metadata. We check provides
  // for now and note this is a placeholder.
  // TODO(ANV-0028-followup): wire tool taxonomy check once ExtensionManifest
  // gains a tools[] field (tracked as part of ANV-0028 full spec).

  // 2. Cedar policy syntax check (block)
  const policiesDir = join(contentPath, 'policies')
  const policyFiles = await safeReadDir(policiesDir)
  for (const fname of policyFiles) {
    if (!fname.endsWith('.cedar')) continue
    const content = await safeReadFile(join(policiesDir, fname))
    if (content === null) continue
    if (!CEDAR_PERMIT_OR_FORBID_RE.test(content)) {
      issues.push({
        severity: 'block',
        message: `policies/${fname}: Cedar policy does not contain a permit() or forbid() block`,
      })
    }
  }

  // 3. hooks.json command allow-list (block)
  const hooksDir = join(contentPath, 'hooks')
  const hookFiles = await safeReadDir(hooksDir)
  for (const fname of hookFiles) {
    if (fname !== 'hooks.json') continue
    const content = await safeReadFile(join(hooksDir, fname))
    if (content === null) continue

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      issues.push({
        severity: 'block',
        message: 'hooks/hooks.json: invalid JSON',
      })
      continue
    }

    // Extract commands from hooks.json
    // Expected shape: { hooks: Array<{ command: string, ... }> }
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'hooks' in parsed &&
      Array.isArray((parsed as Record<string, unknown>).hooks)
    ) {
      const hooks = (parsed as { hooks: unknown[] }).hooks
      for (const hook of hooks) {
        if (
          typeof hook === 'object' &&
          hook !== null &&
          'command' in hook &&
          typeof (hook as Record<string, unknown>).command === 'string'
        ) {
          const cmd = (hook as { command: string }).command
          const baseCmd = cmd.split(' ')[0] ?? cmd
          if (!ALLOWED_HOOK_COMMANDS.has(baseCmd)) {
            issues.push({
              severity: 'block',
              message: `hooks/hooks.json: command "${baseCmd}" is not in the allowed hook command list`,
            })
          }
        }
      }
    }
  }

  if (issues.length === 0) {
    return {
      id: PERMISSION_VALIDATOR_ID,
      severity: 'block',
      status: 'pass',
      message: 'permission checks passed (Cedar syntax, hook commands)',
    }
  }

  const hasBlock = issues.some((i) => i.severity === 'block')
  const severity: 'block' | 'warn' = hasBlock ? 'block' : 'warn'
  const preview = issues.map((i) => i.message).join('; ')

  return {
    id: PERMISSION_VALIDATOR_ID,
    severity,
    status: 'fail',
    message: `${issues.length} permission issue(s): ${preview}`,
    detail: issues,
  }
}
