/**
 * ANV-0247 — Large-output stash helper (experimental build only).
 *
 * Writes the raw tool output to `.anvil/notepads/<branch>/large-outputs.md`,
 * append-mode with a timestamped header + fragment anchor for the summary
 * pointer.
 *
 * In the default build this module is excluded (src/experimental/** is excluded
 * from tsconfig.json). The on-large-output hook uses a dynamic import with
 * try/catch fallback to a no-op so it loads cleanly without this file.
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { safeWrite } from '../../../core/io/safe-write.js'
import {
  deriveBranchSlug,
  getNotepadsDir,
} from '../../../core/notepads/paths.js'

export async function stashLargeOutput(
  cwd: string,
  branch: string,
  toolName: string,
  rawContent: string,
): Promise<string> {
  const slug = deriveBranchSlug(branch)
  const dir = join(getNotepadsDir(cwd), slug)
  await mkdir(dir, { recursive: true })

  const stashPath = join(dir, 'large-outputs.md')
  const now = new Date()
  const ts = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')} ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`
  const anchor = `${toolName.toLowerCase()}-${now.getTime()}`
  const header = `## ${ts} — ${toolName} {#${anchor}}\n\n`

  let existing = ''
  if (existsSync(stashPath)) {
    try {
      existing = await readFile(stashPath, 'utf-8')
    } catch {
      existing = ''
    }
  }

  const preamble =
    existing ||
    `# large-outputs — branch:${slug}\n\nRaw tool outputs stashed by on-large-output hook.\n\n`
  const content = `${preamble}${header}${rawContent}\n\n---\n\n`
  // Large-output stashes can grow with use; raise cap above the 64 KB default.
  safeWrite(stashPath, content, { maxBytes: 4 * 1024 * 1024 })

  return `.anvil/notepads/${slug}/large-outputs.md#${anchor}`
}
