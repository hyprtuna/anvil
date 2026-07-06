/**
 * Summarization helpers for on-large-output (Plan 43 Phase E).
 *
 * - `detectSubprocessRuntime`: bun→node fallback resolver for `bin/anvil[.cjs]`.
 * - `invokeSubprocessSummarizer`: spawns `anvil skill run summarization
 *   --input-stdin`, fed via stdin; returns null on any failure.
 * - `buildMechanicalSummary`: deterministic, no-subprocess fallback that
 *   preserves file paths, error names, and head/tail lines under ~200 words.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Preference: bun → node. Returns null when neither is resolvable.
 * Repo root resolved 4 levels up from this file (src/hooks/handlers/on-large-output/).
 */
export function detectSubprocessRuntime(): {
  runtime: string
  args: string[]
} | null {
  const repoRoot = join(__dirname, '..', '..', '..', '..')

  const bunResult = spawnSync('bun', ['--version'], {
    stdio: 'ignore',
    timeout: 2000,
  })
  if (bunResult.status === 0) {
    const anvilBin = join(repoRoot, 'bin', 'anvil')
    if (existsSync(anvilBin)) {
      return { runtime: 'bun', args: [anvilBin] }
    }
    const anvilCjs = join(repoRoot, 'bin', 'anvil.cjs')
    if (existsSync(anvilCjs)) {
      return { runtime: 'bun', args: [anvilCjs] }
    }
  }

  const nodeResult = spawnSync('node', ['--version'], {
    stdio: 'ignore',
    timeout: 2000,
  })
  if (nodeResult.status === 0) {
    const anvilCjs = join(repoRoot, 'bin', 'anvil.cjs')
    if (existsSync(anvilCjs)) {
      return { runtime: 'node', args: [anvilCjs] }
    }
  }

  return null
}

export function invokeSubprocessSummarizer(toolResult: string): string | null {
  const runtimeInfo = detectSubprocessRuntime()
  if (!runtimeInfo) {
    process.stderr.write(
      '[anvil:on-large-output] warn: no subprocess runtime (bun/node) found — using mechanical fallback\n',
    )
    return null
  }

  const { runtime, args } = runtimeInfo
  const skillArgs = [...args, 'skill', 'run', 'summarization', '--input-stdin']

  try {
    const result = spawnSync(runtime, skillArgs, {
      input: toolResult,
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    })

    if (result.error) {
      process.stderr.write(
        `[anvil:on-large-output] warn: summarization subprocess error: ${result.error.message} — using mechanical fallback\n`,
      )
      return null
    }

    if (result.status !== 0) {
      const stderr = result.stderr?.toString().trim() ?? ''
      process.stderr.write(
        `[anvil:on-large-output] warn: summarization exited ${result.status}${stderr ? `: ${stderr.slice(0, 200)}` : ''} — using mechanical fallback\n`,
      )
      return null
    }

    const stdout = result.stdout?.toString().trim() ?? ''
    if (!stdout) {
      process.stderr.write(
        '[anvil:on-large-output] warn: summarization produced empty output — using mechanical fallback\n',
      )
      return null
    }

    return stdout
  } catch (err) {
    process.stderr.write(
      `[anvil:on-large-output] warn: summarization spawn failed: ${err instanceof Error ? err.message : String(err)} — using mechanical fallback\n`,
    )
    return null
  }
}

/**
 * Mechanical fallback. Preserves file paths, error class names, head/tail
 * meaningful lines. Fits within ~200 words.
 */
export function buildMechanicalSummary(
  toolName: string,
  text: string,
  wordCount: number,
): string {
  const lines = text.split('\n').filter((l) => l.trim().length > 0)
  const totalLines = lines.length
  const byteCount = Buffer.byteLength(text, 'utf-8')

  const pathRe = /(?:^|\s)((?:\.\.?\/|\/|\w:[/\\])[^\s'"`,;)]+)/gm
  const paths = new Set<string>()
  for (const m of text.matchAll(pathRe)) {
    const p = m[1].replace(/[.,;)]+$/, '')
    if (p.includes('.') || p.startsWith('/')) paths.add(p)
    if (paths.size >= 8) break
  }

  const errorRe = /\b([A-Z][A-Za-z]*(?:Error|Exception)|E[A-Z_]{2,})\b/g
  const errors = new Set<string>()
  for (const m of text.matchAll(errorRe)) {
    errors.add(m[1])
    if (errors.size >= 5) break
  }

  const parts: string[] = [
    `[${toolName} summary — ${totalLines} lines / ${(byteCount / 1024).toFixed(1)} KB / ~${wordCount} words]`,
  ]

  if (errors.size > 0)
    parts.push(`Errors/exceptions: ${[...errors].join(', ')}`)
  if (paths.size > 0) parts.push(`Paths: ${[...paths].join(', ')}`)

  const preview: string[] = []
  preview.push(...lines.slice(0, 3).map((l) => l.slice(0, 120)))
  if (lines.length > 5) {
    preview.push('...')
    preview.push(...lines.slice(-2).map((l) => l.slice(0, 120)))
  }
  if (preview.length > 0) parts.push('', ...preview)

  return parts.join('\n')
}
