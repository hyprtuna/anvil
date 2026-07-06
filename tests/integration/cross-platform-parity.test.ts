import { describe, expect, it } from 'vitest'
import { HOOK_KIND_TO_EVENT } from '../../src/core/manifest-schema/claude-code.js'
import {
  HOOK_KIND_TO_OC_EVENT,
  UNMAPPED_OC_HOOKS,
  resolveOcHook,
} from '../../src/core/manifest-schema/opencode.js'
import { HookKind } from '../../src/core/types.js'

/**
 * Plan 28 Phase B6 — cross-platform parity guarantees that no hook
 * silently disappears across Anvil's two adapters. Every `HookKind`
 * must be either mapped to a Claude Code event, or mapped to an
 * OpenCode event, or explicitly listed as `UNMAPPED_OC_HOOKS` (and
 * documented as CC-only). New hook kinds added in Plan 28 Phase D
 * must update this contract before they merge.
 */
describe('cross-platform parity', () => {
  it('every HookKind has a CC mapping OR is documented as CC-only', () => {
    const unmappedOnCc: string[] = []
    for (const kind of HookKind.options) {
      const ccMapped = kind in HOOK_KIND_TO_EVENT
      // CC-only hooks that don't have a CC event today (pre-commit etc.)
      // are tracked here. The contract is: if a hook has no CC event,
      // it must be intentional — meaning the kind is NOT in
      // HOOK_KIND_TO_EVENT but the hook is still useful via some other
      // mechanism (e.g. as a no-op file copied to disk for future
      // wiring). The point of this test is to detect drift if a kind
      // gets added to HookKind without thinking about adapters at all.
      if (!ccMapped) unmappedOnCc.push(kind)
    }
    // We don't assert empty — many internal kinds (read-guard, prompt-guard,
    // workflow-guard, etc.) intentionally have no CC event. The check is
    // that the OC mapping covers exactly the same set on the OC side.
    for (const kind of unmappedOnCc) {
      expect(
        UNMAPPED_OC_HOOKS.has(kind) || kind in HOOK_KIND_TO_OC_EVENT,
        `hook kind '${kind}' has no CC event AND no OC documentation; add it to HOOK_KIND_TO_OC_EVENT or UNMAPPED_OC_HOOKS`,
      ).toBe(true)
    }
  })

  it('every HookKind resolves to mapped or unmapped on the OpenCode side (no orphans)', () => {
    for (const kind of HookKind.options) {
      const r = resolveOcHook(kind)
      expect(
        r.status,
        `hook kind '${kind}' is unknown on the OpenCode adapter; add it to HOOK_KIND_TO_OC_EVENT or UNMAPPED_OC_HOOKS`,
      ).not.toBe('unknown')
    }
  })

  it('OC mapping does not reference hook kinds that were removed from HookKind', () => {
    const known = new Set(HookKind.options as readonly string[])
    for (const kind of Object.keys(HOOK_KIND_TO_OC_EVENT)) {
      expect(
        known.has(kind),
        `OC mapping references unknown kind '${kind}'`,
      ).toBe(true)
    }
    for (const kind of UNMAPPED_OC_HOOKS) {
      expect(
        known.has(kind),
        `UNMAPPED_OC_HOOKS references unknown kind '${kind}'`,
      ).toBe(true)
    }
  })

  it('CC mapping does not reference hook kinds that were removed from HookKind', () => {
    const known = new Set(HookKind.options as readonly string[])
    for (const kind of Object.keys(HOOK_KIND_TO_EVENT)) {
      expect(
        known.has(kind),
        `CC mapping references unknown kind '${kind}'`,
      ).toBe(true)
    }
  })

  it('OC mapping and UNMAPPED_OC_HOOKS are disjoint', () => {
    for (const kind of Object.keys(HOOK_KIND_TO_OC_EVENT)) {
      expect(
        UNMAPPED_OC_HOOKS.has(kind),
        `kind '${kind}' is both mapped and listed as unmapped on the OC side`,
      ).toBe(false)
    }
  })
})

/**
 * Lint: agent prompts must not reference Claude-Code-specific tool
 * names. A subagent dispatched on the OpenCode runtime would
 * receive prompts that talk about `Task()` or `TodoWrite` — both
 * of which are CC-only — and confidently misinstruct itself.
 *
 * Allowlist exists so we can opt specific agents out (e.g. an agent
 * intentionally Claude-Code-only).
 */
describe('agent tool-agnostic language lint', () => {
  const TOOL_AGNOSTIC_ALLOWLIST = new Set<string>([
    // Currently empty — every agent must use tool-agnostic language.
    // Add an agent file name here only with a written justification
    // in the agent's frontmatter (e.g. `cc_only: true`).
  ])

  it('no agent prompts reference CC-only tool names', async () => {
    const { readdir, readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const agentsRoot = join(process.cwd(), 'agents')
    const files = await readdir(agentsRoot)
    const violations: Array<{ file: string; matched: string }> = []
    // Words that flag CC-only references. We match as standalone tokens
    // (with parentheses or word boundaries) to avoid false positives in
    // prose ("the task at hand" should not match the Task tool).
    const patterns: Array<{ name: string; rx: RegExp }> = [
      { name: 'Task() call', rx: /\bTask\(\s*\{/ },
      { name: 'TodoWrite tool', rx: /\bTodoWrite\b/ },
      { name: 'WebSearch tool', rx: /\bWebSearch\(\s*\{/ },
      { name: 'WebFetch tool', rx: /\bWebFetch\(\s*\{/ },
    ]
    for (const file of files) {
      if (!file.endsWith('.md')) continue
      if (TOOL_AGNOSTIC_ALLOWLIST.has(file)) continue
      const text = await readFile(join(agentsRoot, file), 'utf-8')
      for (const { name, rx } of patterns) {
        if (rx.test(text)) violations.push({ file, matched: name })
      }
    }
    expect(
      violations,
      `agents reference CC-only tools — rewrite to tool-agnostic language:\n${violations
        .map((v) => `  ${v.file}: ${v.matched}`)
        .join('\n')}`,
    ).toEqual([])
  })
})
