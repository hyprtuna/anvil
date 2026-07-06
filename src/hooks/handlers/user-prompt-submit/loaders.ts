/**
 * Session-state loaders for user-prompt-submit (Plan 43 Phase H).
 *
 * Reads `.anvil/registry.json` (skill+agent slug lists, written by session-start)
 * and `.anvil/project.json` (Zod-validated ProjectContext). Either source missing
 * is a recoverable degraded mode — callers fall back to empty signals so the
 * router still returns a decision.
 */

import { promises as fs } from 'node:fs'
import {
  ensureProjectDir,
  getProjectScopedPath,
} from '../../../core/io/project-scoped-paths.js'
import { findProjectRoot } from '../../../core/project/root.js'
import { ProjectContext } from '../../../core/types.js'

export async function readRegistry(
  cwd: string,
): Promise<{ skills: string[]; agents: string[] } | null> {
  // ANV-0139: resolve the canonical project root before reading; in a linked
  // worktree, `.anvil/` lives only at the canonical checkout.
  const root = (await findProjectRoot(cwd)) ?? cwd
  // ensureProjectDir migrates legacy paths on first call.
  await ensureProjectDir(root)
  const registryPath = await getProjectScopedPath(root, 'registry')
  try {
    const raw = await fs.readFile(registryPath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as Record<string, unknown>).skills) &&
      Array.isArray((parsed as Record<string, unknown>).agents)
    ) {
      return {
        skills: (parsed as { skills: string[] }).skills,
        agents: (parsed as { agents: string[] }).agents,
      }
    }
  } catch {
    // Missing or corrupt — fall through.
  }
  return null
}

export async function readProjectContext(
  cwd: string,
): Promise<import('../../../core/types.js').ProjectContext | undefined> {
  // ANV-0139: resolve the canonical project root before reading.
  const root = (await findProjectRoot(cwd)) ?? cwd
  // ensureProjectDir migrates legacy paths on first call.
  await ensureProjectDir(root)
  const projectPath = await getProjectScopedPath(root, 'project')
  try {
    const raw = await fs.readFile(projectPath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    const result = ProjectContext.safeParse(parsed)
    return result.success ? result.data : undefined
  } catch {
    return undefined
  }
}
