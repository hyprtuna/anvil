import { describe, expect, it } from 'vitest'
import { generateClaudeCode } from '../../../../src/adapters/claude-code/generate.js'
import type { AdapterContext } from '../../../../src/adapters/interface.js'

function mkCtx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    cwd: '/tmp/x',
    scope: 'project',
    config: {} as never,
    skills: [],
    agents: [],
    hooks: [{ kind: 'session-start', enabled: true }] as never,
    ...overrides,
  }
}

describe('adapters/claude-code/generate', () => {
  it('emits plugin.json under .claude-plugin/', async () => {
    const out = await generateClaudeCode(mkCtx())
    const paths = out.files.map((f) => f.relativePath)
    expect(paths).toContain('.claude-plugin/plugin.json')
  })

  it('emits each skill as skills/<name>/SKILL.md (Claude Code plugin contract)', async () => {
    const out = await generateClaudeCode(
      mkCtx({
        skills: [
          // @ts-expect-error minimal
          {
            frontmatter: { name: 'debugging' },
            sourcePath: 'skills/universal/debugging.md',
          },
        ],
      }),
    )
    const paths = out.files.map((f) => f.relativePath)
    expect(paths).toContain('skills/debugging/SKILL.md')
    // Reject the legacy flat layouts that Claude Code silently ignores.
    expect(paths).not.toContain('skills/debugging.md')
    expect(paths).not.toContain('.claude/skills/anvil/debugging.md')
  })

  it('emits agents under agents/ (plugin-relative)', async () => {
    const out = await generateClaudeCode(
      mkCtx({
        agents: [
          // @ts-expect-error minimal
          {
            frontmatter: { name: 'code-reviewer' },
            sourcePath: 'agents/code-reviewer.md',
          },
        ],
      }),
    )
    const paths = out.files.map((f) => f.relativePath)
    expect(paths).toContain('agents/code-reviewer.md')
  })

  it('emits hooks under hooks/<kind>.cjs', async () => {
    const out = await generateClaudeCode(mkCtx())
    const paths = out.files.map((f) => f.relativePath)
    expect(paths).toContain('hooks/session-start.cjs')
  })

  it('emits at least one slash command under commands/', async () => {
    const out = await generateClaudeCode(mkCtx())
    const commandFiles = out.files.filter(
      (f) =>
        f.relativePath.startsWith('commands/') &&
        f.relativePath.endsWith('.md'),
    )
    expect(commandFiles.length).toBeGreaterThan(0)
  })

  // A2 — Plan 28: hook build artifact path safety. The adapter reads
  // dist-hooks/<kind>.cjs at generation time. If the build hasn't run
  // (or the file was deleted), the loud error must instruct the user
  // to run `bun run build` rather than silently writing an empty hook.
  it('throws an actionable error when a hook artifact is missing', async () => {
    await expect(
      generateClaudeCode(
        mkCtx({
          hooks: [
            { kind: 'a-hook-that-does-not-exist', enabled: true },
          ] as never,
        }),
      ),
    ).rejects.toThrow(/not built at .*; run 'bun run build' first/)
  })
})
