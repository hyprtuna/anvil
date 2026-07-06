import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import { beforeEach, describe, expect, it } from 'vitest'
import { generateClaudeCode } from '../../../../src/adapters/claude-code/generate.js'
import type { AdapterContext } from '../../../../src/adapters/interface.js'
import { AgentFrontmatter } from '../../../../src/core/types.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

/**
 * Plan 28 H2 — round-trip the new optional AgentFrontmatter fields
 * through the Claude Code adapter. CC's agent emission today copies the
 * source file verbatim, so the test guarantees no field is silently
 * stripped or rewritten.
 */
describe('adapters/claude-code/generate — agent frontmatter round-trip', () => {
  let tmp: string

  beforeEach(() => {
    tmp = createTestTmpDir('cc-agent-rt')
  })

  function writeAgent(fm: Record<string, unknown>, body = '# body\n'): string {
    const path = join(tmp, `${(fm.name as string) ?? 'agent'}.md`)
    const fmYaml = matter.stringify(body, fm)
    writeFileSync(path, fmYaml, 'utf-8')
    return path
  }

  function mkCtx(agents: AdapterContext['agents']): AdapterContext {
    return {
      cwd: tmp,
      scope: 'project',
      config: {} as never,
      skills: [],
      hooks: [],
      agents,
    }
  }

  it('preserves every H1 field when an agent declares all of them', async () => {
    const fmIn = {
      name: 'kitchen-sink',
      description: 'agent that touches every new field',
      model: 'opus',
      permissionMode: 'plan',
      color: 'purple',
      tools: ['Read', 'Edit'],
      disallowedTools: ['Edit'],
      skills: ['evidence-before-assertion', 'tdd-iron-law'],
      memory: 'project',
      mcpServers: [
        'shared-search',
        { name: 'local-fs', command: 'mcp-fs', args: ['--root', '/tmp'] },
      ],
      hooks: [{ event: 'post-tool-use' }],
      background: true,
      isolation: 'worktree',
      initialPrompt: 'Begin.',
      role: 'orchestrator',
      group: 'planning',
      trigger: ['kitchen sink'],
      max_turns: 25,
    }
    const sourcePath = writeAgent(fmIn)
    const parsed = AgentFrontmatter.parse(matter.read(sourcePath).data)

    const out = await generateClaudeCode(
      mkCtx([{ frontmatter: parsed, body: '# body', sourcePath }]),
    )
    const emitted = out.files.find(
      (f) => f.relativePath === 'agents/kitchen-sink.md',
    )
    expect(emitted).toBeDefined()
    const reparsed = matter(String(emitted?.content ?? '')).data
    expect(reparsed.disallowedTools).toEqual(['Edit'])
    expect(reparsed.skills).toEqual([
      'evidence-before-assertion',
      'tdd-iron-law',
    ])
    expect(reparsed.memory).toBe('project')
    expect(reparsed.mcpServers).toEqual([
      'shared-search',
      { name: 'local-fs', command: 'mcp-fs', args: ['--root', '/tmp'] },
    ])
    expect(reparsed.hooks).toEqual([{ event: 'post-tool-use' }])
    expect(reparsed.background).toBe(true)
    expect(reparsed.isolation).toBe('worktree')
    expect(reparsed.initialPrompt).toBe('Begin.')
  })

  it('emits no extra keys when an agent declares none of the H1 fields', async () => {
    const fmIn = {
      name: 'minimal',
      description: 'unchanged shape — only legacy CC fields',
      model: 'inherit',
      tools: ['Read'],
    }
    const sourcePath = writeAgent(fmIn)
    const parsed = AgentFrontmatter.parse(matter.read(sourcePath).data)

    const out = await generateClaudeCode(
      mkCtx([{ frontmatter: parsed, body: '# body', sourcePath }]),
    )
    const emitted = out.files.find(
      (f) => f.relativePath === 'agents/minimal.md',
    )
    expect(emitted).toBeDefined()
    const reparsed = matter(String(emitted?.content ?? '')).data
    const newKeys = [
      'disallowedTools',
      'skills',
      'memory',
      'mcpServers',
      'hooks',
      'background',
      'isolation',
      'initialPrompt',
    ]
    for (const k of newKeys) expect(reparsed[k]).toBeUndefined()
  })
})
