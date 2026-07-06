#!/usr/bin/env bun
/**
 * One-shot retag for AgentFrontmatter: `category: …` → `role: …` (T3.1).
 *
 * Hand-curated mapping per the plan. Runs in dry mode by default; pass
 * `--apply` to edit files in place.
 *
 * Usage:
 *   bun scripts/retag-agents.ts            # dry run (default)
 *   bun scripts/retag-agents.ts --apply    # apply
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROLE_MAP: Record<
  string,
  'orchestrator' | 'worker' | 'verification' | 'researcher'
> = {
  'code-architect': 'worker',
  'code-explorer': 'researcher',
  'code-reviewer': 'verification',
  'code-simplifier': 'worker',
  'doc-verifier': 'verification',
  'framework-selector': 'researcher',
  'mcp-builder': 'worker',
  orchestrator: 'orchestrator',
  'plan-verifier': 'verification',
  researcher: 'researcher',
  'silent-failure-hunter': 'verification',
  'subagent-executor': 'orchestrator',
  'test-analyzer': 'verification',
  'ultra-worker': 'orchestrator',
}

const APPLY = process.argv.includes('--apply')
const ROOT = new URL('..', import.meta.url).pathname
const AGENTS_DIR = join(ROOT, 'agents')

function process_(name: string, role: string): void {
  const path = join(AGENTS_DIR, `${name}.md`)
  const raw = readFileSync(path, 'utf-8')
  if (!raw.startsWith('---\n')) {
    console.warn(`skip (no frontmatter): ${path}`)
    return
  }
  const end = raw.indexOf('\n---\n', 4)
  if (end === -1) {
    console.warn(`skip (unterminated frontmatter): ${path}`)
    return
  }
  const fm = raw.slice(4, end)
  const body = raw.slice(end + 5)

  let newFm: string
  if (/^category:\s*/m.test(fm)) {
    newFm = fm.replace(/^category:\s*\S+.*$/m, `role: ${role}`)
    console.log(
      `${APPLY ? 'rewrite' : 'would rewrite'} ${name}: category → role ${role}`,
    )
  } else if (/^role:\s*/m.test(fm)) {
    console.log(`keep (already has role): ${name}`)
    return
  } else {
    const lines = fm.split('\n')
    const nameIdx = lines.findIndex((l) => l.startsWith('name:'))
    if (nameIdx === -1) lines.unshift(`role: ${role}`)
    else lines.splice(nameIdx + 1, 0, `role: ${role}`)
    newFm = lines.join('\n')
    console.log(`${APPLY ? 'add' : 'would add'} role: ${role} to ${name}`)
  }

  if (APPLY) {
    writeFileSync(path, `---\n${newFm}\n---\n${body}`)
  }
}

for (const [name, role] of Object.entries(ROLE_MAP)) {
  process_(name, role)
}

console.log(`\nDone${APPLY ? '' : ' (dry run — pass --apply to write)'}.`)
