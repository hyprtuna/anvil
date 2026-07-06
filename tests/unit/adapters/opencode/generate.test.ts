import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AdapterContext } from '../../../../src/adapters/interface.js'
import { generateOpenCode } from '../../../../src/adapters/opencode/generate.js'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

let tmp: string

beforeAll(() => {
  tmp = createTestTmpDir('oc-gen')
})

afterAll(() => {
  rmSync(tmp, { recursive: true })
})

function makeContext(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    cwd: tmp,
    scope: 'project',
    config: buildDefaultConfig(),
    skills: [],
    hooks: [],
    agents: [],
    ...overrides,
  }
}

describe('generateOpenCode', () => {
  it('returns adapterName opencode', async () => {
    const result = await generateOpenCode(makeContext())
    expect(result.adapterName).toBe('opencode')
  })

  it('emits plugins/opencode/package.json (v2 plugin layout)', async () => {
    const result = await generateOpenCode(makeContext())
    const paths = result.files.map((f) => f.relativePath)
    expect(paths).toContain('plugins/opencode/package.json')
  })

  it('emits plugins/opencode/index.js (v2 plugin layout)', async () => {
    const result = await generateOpenCode(makeContext())
    const paths = result.files.map((f) => f.relativePath)
    expect(paths).toContain('plugins/opencode/index.js')
  })

  it('does NOT emit models.json (dead artifact — D-09)', async () => {
    const result = await generateOpenCode(makeContext())
    const paths = result.files.map((f) => f.relativePath)
    expect(paths).not.toContain('models.json')
  })

  it('does NOT emit opencode.json (not a real OpenCode file)', async () => {
    const result = await generateOpenCode(makeContext())
    expect(
      result.files.some((f) => f.relativePath.endsWith('opencode.json')),
    ).toBe(false)
  })

  it('sets installRoot to cwd for project scope', async () => {
    const result = await generateOpenCode(makeContext())
    expect(result.installRoot).toBe(tmp)
  })

  it('sets installRoot to home for global scope', async () => {
    const fakeHome = join(tmp, 'home')
    const result = await generateOpenCode(
      makeContext({ scope: 'global', home: fakeHome }),
    )
    expect(result.installRoot).toBe(fakeHome)
  })

  it('includes skill files as skills/<name>/SKILL.md when skills are provided', async () => {
    const skillDir = join(tmp, 'oc-skills')
    mkdirSync(skillDir, { recursive: true })
    const skillPath = join(skillDir, 'oc-skill.md')
    writeFileSync(skillPath, '---\nname: oc-skill\n---\nContent')

    const skill = {
      frontmatter: {
        name: 'oc-skill',
        group: 'test',
        description: 'A test skill for opencode',
        trigger: [],
        preferred_model: 'claude-sonnet-4-6',
        preferred_effort: 'medium' as const,
        inputs: [],
        outputs: [],
        tools: [],
        chains: [],
        language: 'universal',
        tags: [],
        aliases: [],
        isHidden: false,
      },
      body: 'Content',
      sourcePath: skillPath,
      tier: 'universal' as const,
    }

    const result = await generateOpenCode(makeContext({ skills: [skill] }))
    const paths = result.files.map((f) => f.relativePath)
    expect(paths).toContain('skills/oc-skill/SKILL.md')
  })

  it('does NOT emit agents/ paths given agent input (D-09 — routes through plugin loader)', async () => {
    const agentDir = join(tmp, 'oc-agents')
    mkdirSync(agentDir, { recursive: true })
    const agentPath = join(agentDir, 'my-agent.md')
    writeFileSync(
      agentPath,
      '---\nname: my-agent\ndescription: test agent\n---\n# body\n',
    )
    const agent = {
      frontmatter: {
        name: 'my-agent',
        description: 'test agent',
        model: 'claude-sonnet-4-6',
        tools: [],
      },
      body: '# body',
      sourcePath: agentPath,
    }
    const result = await generateOpenCode(
      makeContext({ agents: [agent as never] }),
    )
    const paths = result.files.map((f) => f.relativePath)
    expect(paths.some((p) => p.startsWith('agents/'))).toBe(false)
    // Plugin artifacts still present
    expect(paths).toContain('plugins/opencode/package.json')
    expect(paths).toContain('plugins/opencode/index.js')
  })

  it('does NOT emit hooks/ paths given hook input (D-09 — routes through plugin loader)', async () => {
    const hook = {
      kind: 'pre-commit' as const,
      handler: async () => ({ exitCode: 0 as const }),
      name: 'pre-commit',
      enabled: true,
    }
    const result = await generateOpenCode(makeContext({ hooks: [hook] }))
    const paths = result.files.map((f) => f.relativePath)
    expect(paths.some((p) => p.startsWith('hooks/'))).toBe(false)
    // Plugin artifacts still present
    expect(paths).toContain('plugins/opencode/package.json')
    expect(paths).toContain('plugins/opencode/index.js')
  })
})
