/**
 * ANV-0106 — load a skill's body for use as the system prompt in
 * skill-e2e tests.
 *
 * Strips the YAML frontmatter (skills carry routing metadata that is
 * irrelevant to the model). We use gray-matter — already in deps.
 *
 * Robust to skills with or without optional frontmatter fields added
 * by recent tickets (activation, scope, expected_tokens). We only read
 * the body content, so optional metadata never blocks loading.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import matter from 'gray-matter'

// Skills live at <repo>/skills/. Tests run from <repo>, so this is
// resolved relative to process.cwd() at call time.
const SKILLS_ROOT = resolve(process.cwd(), 'skills')

export interface SkillFileRef {
  /** Relative path under skills/, e.g. "universal/rules/tdd-iron-law.md". */
  relativePath: string
}

export async function loadSkillBody(ref: SkillFileRef): Promise<string> {
  const path = resolve(SKILLS_ROOT, ref.relativePath)
  const raw = await readFile(path, 'utf-8')
  const { content } = matter(raw)
  return content.trim()
}
