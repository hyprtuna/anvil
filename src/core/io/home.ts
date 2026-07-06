import { homedir } from 'node:os'

/**
 * User home directory, honoring `process.env.HOME` when set.
 *
 * Why this exists: Bun's `os.homedir()` ignores `$HOME` overrides (unlike
 * Node, which reads `$HOME` on every call on POSIX). Tests that override
 * `process.env.HOME = <tmp>` to isolate writes from the real user home see
 * `homedir()` return the real home on bun-test, leaking writes to
 * `~/.config/opencode/opencode.json`, `~/.claude/`, etc.
 *
 * Routing every installer/CLI homedir call through this helper makes
 * `process.env.HOME = <tmp>` work uniformly across both runtimes.
 *
 * Production: `process.env.HOME` is always set; falls back to `homedir()`
 * for completeness.
 *
 * Tests MUST override via `process.env.HOME` (not e.g. `XDG_CONFIG_HOME`)
 * since this is the single chokepoint.
 */
export function getUserHome(): string {
  return process.env.HOME ?? homedir()
}
