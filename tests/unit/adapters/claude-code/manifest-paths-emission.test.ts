import { describe, expect, it } from 'vitest'
import { generateClaudeCode } from '../../../../src/adapters/claude-code/generate.js'
import type { AdapterContext } from '../../../../src/adapters/interface.js'
import type { Skill } from '../../../../src/core/types.js'

/**
 * Plan 39 Phase C — paths field emission in the CC adapter.
 *
 * When a skill declares `paths: ["**\/*.ts"]`, the CC manifest must carry
 * the paths array so Claude Code can inject the skill body on matching
 * file edits (Edit/Write/MultiEdit tool calls).
 *
 * Eager mode: paths travel in the raw SKILL.md YAML frontmatter (CC reads
 * it directly from the file). The content is copied verbatim from disk so
 * no adapter code needs to extract and re-emit paths — the file already
 * contains the field.
 *
 * Lazy mode: the adapter emits a skills/_index.json where each entry has
 * a `frontmatter` object. Because `paths` is part of `SkillFrontmatter`
 * (the Zod-parsed shape), it is included in `frontmatter` and therefore
 * serialized into the index.
 */

/** Minimal valid SkillFrontmatter shape (as parsed by Zod). */
function makeSkillWithPaths(globs: string[]): Skill {
  return {
    frontmatter: {
      name: 'ts-rules',
      description: 'Use when editing TypeScript files',
      preferred_model: 'haiku',
      preferred_effort: 'low',
      group: 'rules',
      kind: 'meta',
      trigger: [],
      inputs: [],
      outputs: [],
      tools: [],
      chains: [],
      language: 'universal',
      tags: [],
      aliases: [],
      isHidden: false,
      'user-invocable': false,
      'disable-model-invocation': false,
      // camelCase aliases added by the Zod transform
      userInvocable: false,
      disableModelInvocation: false,
      argumentHint: undefined,
      allowedTools: undefined,
      paths: globs,
    } as Skill['frontmatter'],
    body: undefined,
    sourcePath: '/fake/ts-rules.md',
    tier: 'language',
    defects: [],
  }
}

function makeLazyCtx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    cwd: '/tmp/x',
    scope: 'project',
    // Enable lazy_load so the adapter emits skills/_index.json (in-memory
    // JSON, no disk read) — allows us to verify paths without a real file.
    config: { skills: { lazy_load: true } } as never,
    skills: [],
    agents: [],
    hooks: [{ kind: 'session-start', enabled: true }] as never,
    ...overrides,
  }
}

describe('adapters/claude-code — paths field emission (Plan 39 Phase C)', () => {
  it('includes paths in skills/_index.json (lazy mode) when skill declares paths', async () => {
    const skill = makeSkillWithPaths(['**/*.ts', '**/*.tsx'])
    const out = await generateClaudeCode(makeLazyCtx({ skills: [skill] }))

    const indexFile = out.files.find(
      (f) => f.relativePath === 'skills/_index.json',
    )
    expect(indexFile).toBeDefined()

    const index = JSON.parse(indexFile!.content as string) as Array<{
      name: string
      frontmatter: { paths?: string[] }
    }>
    expect(index).toHaveLength(1)
    expect(index[0].frontmatter.paths).toEqual(['**/*.ts', '**/*.tsx'])
  })

  it('omits paths key from skills/_index.json (lazy mode) when skill has no paths', async () => {
    const skill = makeSkillWithPaths([])
    // Override paths to undefined to simulate a skill without the field.
    skill.frontmatter.paths = undefined
    const out = await generateClaudeCode(makeLazyCtx({ skills: [skill] }))

    const indexFile = out.files.find(
      (f) => f.relativePath === 'skills/_index.json',
    )
    expect(indexFile).toBeDefined()

    const index = JSON.parse(indexFile!.content as string) as Array<{
      frontmatter: { paths?: string[] }
    }>
    expect(index[0].frontmatter.paths).toBeUndefined()
  })

  it('skills/_index.json preserves all glob patterns verbatim', async () => {
    const globs = ['src/**/*.ts', '!**/*.d.ts', '**/*.tsx']
    const skill = makeSkillWithPaths(globs)
    const out = await generateClaudeCode(makeLazyCtx({ skills: [skill] }))

    const indexFile = out.files.find(
      (f) => f.relativePath === 'skills/_index.json',
    )!
    const index = JSON.parse(indexFile.content as string) as Array<{
      frontmatter: { paths?: string[] }
    }>
    expect(index[0].frontmatter.paths).toEqual(globs)
  })
})
