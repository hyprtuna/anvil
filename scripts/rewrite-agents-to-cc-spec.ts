#!/usr/bin/env bun
/**
 * One-shot rewrite: convert every agents/*.md frontmatter to the Claude Code
 * subagent spec, with Anvil extensions preserved in a stable order.
 *
 * Per `project_claude_code_subagent_format.md` + v0.2.0 decision:
 *   Required (CC):  name, description
 *   Optional (CC):  model, permissionMode, color, tools
 *   Anvil-internal: role, group, trigger, max_turns
 *
 * Dropped entirely: preferred_model, preferred_effort, max_tokens, tier,
 * mode, tool_permissions, inputs, outputs, chains, language, kind, tags,
 * aliases, isHidden, tooltip, license, fallback_model, cost,
 * delegation_triggers, variants.
 *
 * Each agent gets a hand-curated model/permissionMode/color/tools per the
 * MAP below. `--dry` to preview, no flag to apply.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

type AgentModel = 'sonnet' | 'opus' | 'haiku' | 'inherit'
type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'auto'
  | 'dontAsk'
  | 'bypassPermissions'
  | 'plan'
type Color =
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'purple'
  | 'orange'
  | 'pink'
  | 'cyan'
type Tool = 'Read' | 'Edit' | 'Bash' | 'Glob' | 'Grep'

interface AgentSpec {
  model: AgentModel
  permissionMode?: PermissionMode
  color?: Color
  tools: Tool[]
}

/**
 * Hand-curated per-agent subagent spec. Values chosen per user preference:
 *   Opus   → planning, code review, major-bug investigation
 *   Sonnet → feature implementation, worker-class agents
 *   Haiku  → mindless / routine work (git, search, formatting, simple checks)
 */
const MAP: Record<string, AgentSpec> = {
  'code-architect': {
    model: 'opus',
    permissionMode: 'plan',
    color: 'purple',
    tools: ['Read', 'Glob', 'Grep'],
  },
  'code-explorer': {
    model: 'haiku',
    permissionMode: 'default',
    color: 'cyan',
    tools: ['Read', 'Glob', 'Grep'],
  },
  'code-reviewer': {
    model: 'opus',
    permissionMode: 'default',
    color: 'purple',
    tools: ['Read', 'Glob', 'Grep', 'Bash'],
  },
  'code-simplifier': {
    model: 'sonnet',
    permissionMode: 'acceptEdits',
    color: 'blue',
    tools: ['Read', 'Edit', 'Glob', 'Grep'],
  },
  'doc-verifier': {
    model: 'sonnet',
    permissionMode: 'default',
    color: 'green',
    tools: ['Read', 'Glob', 'Grep'],
  },
  'framework-selector': {
    model: 'opus',
    permissionMode: 'default',
    color: 'yellow',
    tools: ['Read', 'Glob', 'Grep'],
  },
  'mcp-builder': {
    model: 'sonnet',
    permissionMode: 'acceptEdits',
    color: 'blue',
    tools: ['Read', 'Edit', 'Bash', 'Glob', 'Grep'],
  },
  orchestrator: {
    model: 'opus',
    permissionMode: 'plan',
    color: 'purple',
    tools: ['Read', 'Glob', 'Grep'],
  },
  'plan-verifier': {
    model: 'opus',
    permissionMode: 'default',
    color: 'purple',
    tools: ['Read', 'Glob', 'Grep'],
  },
  researcher: {
    model: 'haiku',
    permissionMode: 'default',
    color: 'cyan',
    tools: ['Read', 'Glob', 'Grep'],
  },
  'silent-failure-hunter': {
    model: 'opus',
    permissionMode: 'default',
    color: 'orange',
    tools: ['Read', 'Glob', 'Grep', 'Bash'],
  },
  'subagent-executor': {
    model: 'sonnet',
    permissionMode: 'acceptEdits',
    color: 'blue',
    tools: ['Read', 'Edit', 'Bash', 'Glob', 'Grep'],
  },
  'test-analyzer': {
    model: 'sonnet',
    permissionMode: 'default',
    color: 'green',
    tools: ['Read', 'Glob', 'Grep', 'Bash'],
  },
  'ultra-worker': {
    model: 'sonnet',
    permissionMode: 'acceptEdits',
    color: 'blue',
    tools: ['Read', 'Edit', 'Bash', 'Glob', 'Grep'],
  },
}

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

const DRY = process.argv.includes('--dry')
const AGENTS_DIR = new URL('../agents/', import.meta.url).pathname

function parseOld(raw: string): {
  fm: Record<string, string>
  body: string
} | null {
  if (!raw.startsWith('---\n')) return null
  const end = raw.indexOf('\n---\n', 4)
  if (end === -1) return null
  const fmText = raw.slice(4, end)
  const body = raw.slice(end + 5)
  // Very lightweight YAML reader — we only need top-level scalars.
  const fm: Record<string, string> = {}
  for (const line of fmText.split('\n')) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/)
    if (m && !line.startsWith(' ')) fm[m[1]] = m[2].trim()
  }
  return { fm, body }
}

function serializeList(items: string[]): string {
  return `[${items.join(', ')}]`
}

async function collect(): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(AGENTS_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    if (entry.name === 'CLAUDE.md' || entry.name === 'AGENTS.md') continue
    out.push(join(AGENTS_DIR, entry.name))
  }
  return out
}

let changed = 0
for (const path of (await collect()).sort()) {
  const raw = readFileSync(path, 'utf-8')
  const parts = parseOld(raw)
  if (!parts) {
    console.warn(`skip (no frontmatter): ${path}`)
    continue
  }
  const name = parts.fm.name ?? path.split('/').pop()!.replace(/\.md$/, '')
  const spec = MAP[name]
  if (!spec) {
    console.warn(`skip (no spec in MAP): ${name} @ ${path}`)
    continue
  }
  const description = (parts.fm.description ?? '').replace(/^['"]|['"]$/g, '')
  if (!description) {
    console.warn(`skip (no description): ${name}`)
    continue
  }
  const role = ROLE_MAP[name]
  // Preserve any existing trigger list from the old frontmatter verbatim.
  const trigger = parts.fm.trigger ?? '[]'
  const group = parts.fm.group ?? ''

  const lines: string[] = ['---']
  lines.push(`name: ${name}`)
  lines.push(`description: ${description}`)
  lines.push(`model: ${spec.model}`)
  if (spec.permissionMode) lines.push(`permissionMode: ${spec.permissionMode}`)
  if (spec.color) lines.push(`color: ${spec.color}`)
  lines.push(`tools: ${serializeList(spec.tools)}`)
  if (role) lines.push(`role: ${role}`)
  if (group) lines.push(`group: ${group}`)
  lines.push(`trigger: ${trigger}`)
  lines.push('---')

  const next = `${lines.join('\n')}\n${parts.body}`
  if (next === raw) {
    continue
  }
  changed++
  console.log(`${DRY ? 'would rewrite' : 'rewrite'}: ${name}`)
  if (!DRY) writeFileSync(path, next)
}

console.log(
  `\n${changed} agent file(s) ${DRY ? 'would be' : 'were'} rewritten.`,
)
