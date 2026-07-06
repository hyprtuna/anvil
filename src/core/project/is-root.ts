import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Project root markers — presence of any one of these means the directory
 * is a project root. Mirrors the standard set used by editors and build tools.
 */
const PROJECT_ROOT_MARKERS = [
  '.git',
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'Gemfile',
  'composer.json',
] as const

/**
 * Returns true when `cwd` contains at least one recognised project root marker.
 * Pure function — no async, no side effects beyond existsSync().
 *
 * Used by `anvil doctor` to gate project-specific check rows: rows that read
 * from `<cwd>/.claude/`, `<cwd>/.opencode/`, etc. should `skip` when this
 * returns false.
 */
export function isProjectRoot(cwd: string): boolean {
  return PROJECT_ROOT_MARKERS.some((marker) => existsSync(join(cwd, marker)))
}
