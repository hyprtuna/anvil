export interface CliOptions {
  json?: boolean
  quiet?: boolean
}

/**
 * Returns true (and writes the JSON payload to stdout) when JSON output is
 * requested either by:
 *   - the per-command `--json` flag (`opts.json === true`), or
 *   - the global `--output json` flag, propagated via
 *     `process.env.ANVIL_OUTPUT_FORMAT === 'json'` (set by the Commander root
 *     in `src/index.ts`).
 *
 * Both surfaces are equivalent: `anvil doctor --json` and
 * `anvil --output json doctor` produce the same output.
 */
export function maybeEmitJson(value: unknown, opts: CliOptions): boolean {
  const globalJson = process.env.ANVIL_OUTPUT_FORMAT === 'json'
  if (opts.json || globalJson) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
    return true
  }
  return false
}
