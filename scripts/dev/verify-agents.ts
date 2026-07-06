/**
 * ANV-0190 — Wrap `anvil agent lint --json` for the local source tree.
 *
 * Emits the lint command's output verbatim (JSON).
 * Exit 0 on lint pass, exit 2 on lint fail or error.
 * Never writes to stderr unless --debug is passed.
 */

import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEBUG = process.argv.includes('--debug')
const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')
const BIN = join(ROOT, 'bin', 'anvil.cjs')

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = ['node', BIN, 'agent', 'lint', '--json']

  const result = spawnSync(args[0] as string, args.slice(1), {
    cwd: ROOT,
    shell: false,
    encoding: 'utf-8',
    timeout: 60_000,
  })

  const stdout = (result.stdout ?? '').trim()
  const stderr = (result.stderr ?? '').trim()

  if (DEBUG && stderr) {
    process.stderr.write(stderr + '\n')
  }

  if (!stdout) {
    const failure = {
      ok: false,
      error: `anvil agent lint exited ${result.status ?? 1} with no output`,
    }
    process.stdout.write(`${JSON.stringify(failure)}\n`)
    process.exit(2)
  }

  // Parse and add `ok` field based on exit code + results (pass-through + normalize)
  const exitOk = result.status === 0
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>
    // Determine ok: pass when exit 0 and no error-level results
    const results = Array.isArray(parsed.results) ? parsed.results : []
    const hasErrors = results.some(
      (r: unknown) =>
        r !== null &&
        typeof r === 'object' &&
        (r as Record<string, unknown>).level === 'error',
    )
    const ok = exitOk && !hasErrors
    process.stdout.write(`${JSON.stringify({ ok, ...parsed })}\n`)
  } catch {
    // Output was not JSON — wrap it
    process.stdout.write(`${JSON.stringify({ ok: exitOk, raw: stdout })}\n`)
  }
  process.exit(exitOk ? 0 : 2)
}

// Canonical ESM main-guard
const moduleFile = fileURLToPath(import.meta.url)
const entryFile = process.argv[1] ? resolve(process.argv[1]) : ''
if (moduleFile === entryFile) {
  main()
}
