#!/usr/bin/env bun
/**
 * One-shot retag for SkillFrontmatter.kind (T2.11).
 *
 * Rule: if frontmatter already has `chains:` or `workflow:` → `composite`.
 *       Otherwise → `atomic`.
 *
 * Files already carrying `kind:` (rule skills under skills/universal/rules/)
 * are left alone.
 *
 * Usage:
 *   bun scripts/retag-skills.ts --dry    # print proposed actions
 *   bun scripts/retag-skills.ts          # apply in place
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SKILLS = join(ROOT, 'skills')
const DRY = process.argv.includes('--dry')

async function collectMarkdown(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await collectMarkdown(full)))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      if (entry.name === 'CLAUDE.md' || entry.name === 'AGENTS.md') continue
      out.push(full)
    }
  }
  return out
}

function splitFrontmatter(raw: string): { fm: string; body: string } | null {
  if (!raw.startsWith('---\n')) return null
  const end = raw.indexOf('\n---\n', 4)
  if (end === -1) return null
  return { fm: raw.slice(4, end), body: raw.slice(end + 5) }
}

function decideKind(fm: string): 'atomic' | 'composite' | 'meta' {
  if (/^kind:\s*(atomic|composite|meta)\b/m.test(fm)) {
    const match = fm.match(/^kind:\s*(atomic|composite|meta)\b/m)
    if (match) return match[1] as 'atomic' | 'composite' | 'meta'
  }
  if (/^chains:/m.test(fm) || /^workflow:/m.test(fm)) return 'composite'
  return 'atomic'
}

function injectKind(fm: string, kind: string): string {
  if (/^kind:/m.test(fm)) return fm
  // Place `kind:` right after `name:` for readability.
  const lines = fm.split('\n')
  const nameIdx = lines.findIndex((l) => l.startsWith('name:'))
  if (nameIdx === -1) {
    lines.unshift(`kind: ${kind}`)
  } else {
    lines.splice(nameIdx + 1, 0, `kind: ${kind}`)
  }
  return lines.join('\n')
}

const files = await collectMarkdown(SKILLS)
let composite = 0
let atomic = 0
let meta = 0
let skipped = 0

for (const file of files.sort()) {
  const raw = readFileSync(file, 'utf-8')
  const parts = splitFrontmatter(raw)
  if (!parts) {
    console.warn(`skip (no frontmatter): ${file}`)
    skipped++
    continue
  }
  const existing = /^kind:\s*(\w+)/m.exec(parts.fm)
  if (existing) {
    console.log(`keep (already ${existing[1]}): ${file}`)
    if (existing[1] === 'composite') composite++
    else if (existing[1] === 'atomic') atomic++
    else if (existing[1] === 'meta') meta++
    continue
  }
  const kind = decideKind(parts.fm)
  console.log(`${DRY ? 'would tag' : 'tag'} ${kind}: ${file}`)
  if (kind === 'composite') composite++
  else if (kind === 'meta') meta++
  else atomic++

  if (!DRY) {
    const newFm = injectKind(parts.fm, kind)
    const newRaw = `---\n${newFm}\n---\n${parts.body}`
    writeFileSync(file, newRaw)
  }
}

console.log(
  `\nSummary: ${atomic} atomic, ${composite} composite, ${meta} meta, ${skipped} skipped${
    DRY ? ' (dry run)' : ''
  }`,
)
