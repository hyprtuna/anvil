import { statSync } from 'node:fs'
import { delimiter, join } from 'node:path'

/**
 * Pure-Node PATH probe. Returns true iff `name` resolves to an
 * existing file under any directory in process.env.PATH.
 * No process spawn, no `which` invocation (D-05).
 *
 * POSIX-only: no `.exe` suffix resolution on Windows.
 */
export function isBinaryOnPath(name: string): boolean {
  const path = process.env.PATH ?? ''
  if (!path || !name || name.includes('/')) return false
  for (const dir of path.split(delimiter)) {
    if (!dir) continue
    try {
      const stat = statSync(join(dir, name))
      if (stat.isFile()) return true
    } catch {
      // not present in this dir, try next
    }
  }
  return false
}
