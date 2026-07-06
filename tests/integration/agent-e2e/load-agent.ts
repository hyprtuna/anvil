/**
 * ANV-0193 — load an agent body for use in agent-e2e tests.
 *
 * Strips the YAML frontmatter (agents carry routing metadata that is
 * irrelevant to behavioral assertions). Uses gray-matter — already in deps.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import matter from 'gray-matter'

// Agents live at <repo>/agents/. Tests run from <repo>, so resolve relative to cwd.
const AGENTS_ROOT = resolve(process.cwd(), 'agents')

export interface AgentFileRef {
  /** Relative path under agents/, e.g. "ultra-worker.md". */
  relativePath: string
}

export async function loadAgentBody(ref: AgentFileRef): Promise<string> {
  const path = resolve(AGENTS_ROOT, ref.relativePath)
  const raw = await readFile(path, 'utf-8')
  const { content } = matter(raw)
  return content.trim()
}
