import { describe, expect, it } from 'vitest'
import type { AdapterContext } from '../../../../src/adapters/interface.js'
import { generateOpenCode } from '../../../../src/adapters/opencode/generate.js'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import type { Skill } from '../../../../src/core/types.js'

/**
 * Plan 39 Phase C — paths field handling in the OC adapter.
 *
 * OpenCode does not (as of v0.10.2) have a path-scoped skill injection
 * mechanism equivalent to CC's `paths:` field. The OC adapter therefore
 * does NOT emit a `paths` key in any OC-specific manifest structure.
 *
 * Behaviour:
 * - Eager mode: the raw SKILL.md is copied verbatim. The `paths:` key will
 *   be present in the YAML frontmatter of the file, but OpenCode silently
 *   ignores unknown frontmatter fields — no injection on file match occurs.
 * - Lazy mode: `skills/_index.json` contains `frontmatter` verbatim,
 *   so `paths` appears there too — but OC doesn't act on it.
 *
 * These tests document and pin this "silent pass-through" contract so that
 * future OC versions that do support path-scoped injection can be wired by
 * updating this test alongside the adapter.
 *
 * Risk: Plan 39 §Risks acknowledges that OC path injection is a future
 * item; skipping silently is the correct behaviour today.
 */

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
    config: { ...buildDefaultConfig(), skills: { lazy_load: true } } as never,
    skills: [],
    hooks: [],
    agents: [],
    ...overrides,
  }
}

describe('adapters/opencode — paths field handling (Plan 39 Phase C)', () => {
  it('passes paths through into skills/_index.json frontmatter (lazy mode)' +
    ' — OC silently ignores the field; no path-scoped injection occurs', async () => {
    const skill = makeSkillWithPaths(['**/*.ts'])
    const out = await generateOpenCode(makeLazyCtx({ skills: [skill] }))

    const indexFile = out.files.find(
      (f) => f.relativePath === 'skills/_index.json',
    )
    expect(indexFile).toBeDefined()

    // `paths` appears in the serialised frontmatter because the adapter
    // emits `frontmatter` verbatim. OpenCode ignores the field at runtime.
    const index = JSON.parse(indexFile!.content as string) as Array<{
      frontmatter: { paths?: string[] }
    }>
    expect(index[0].frontmatter.paths).toEqual(['**/*.ts'])
  })

  it('does NOT add a dedicated top-level paths field to the OC plugin manifest' +
    ' — no OC-native path-scoping mechanism exists', async () => {
    const skill = makeSkillWithPaths(['**/*.ts'])
    const out = await generateOpenCode(makeLazyCtx({ skills: [skill] }))

    // The OC package.json (plugins/opencode/package.json) should not have
    // a `paths` key at the top level — that would be an invented field with
    // no OC spec backing.
    const pkgFile = out.files.find(
      (f) => f.relativePath === 'plugins/opencode/package.json',
    )
    expect(pkgFile).toBeDefined()
    const pkg = JSON.parse(pkgFile!.content as string) as Record<
      string,
      unknown
    >
    expect(pkg).not.toHaveProperty('paths')
  })

  it('skill without paths — paths key absent from _index.json frontmatter', async () => {
    const skill = makeSkillWithPaths([])
    skill.frontmatter.paths = undefined
    const out = await generateOpenCode(makeLazyCtx({ skills: [skill] }))

    const indexFile = out.files.find(
      (f) => f.relativePath === 'skills/_index.json',
    )!
    const index = JSON.parse(indexFile.content as string) as Array<{
      frontmatter: { paths?: string[] }
    }>
    expect(index[0].frontmatter.paths).toBeUndefined()
  })
})
