import { describe, expect, it } from 'vitest'
import { generateOpenCode } from '../../src/adapters/opencode/generate.js'
import { buildFixtureContext } from '../helpers/fixtures.js'

describe('generateOpenCode (v2)', () => {
  it('emits a package.json and an index.js for the plugin, plus skills/agents as files', async () => {
    const out = await generateOpenCode(buildFixtureContext({}))
    const paths = out.files.map((f) => f.relativePath)
    expect(paths).toContain('plugins/opencode/package.json')
    expect(paths).toContain('plugins/opencode/index.js')
  })
  it('does NOT emit an invented opencode.json manifest', async () => {
    const out = await generateOpenCode(buildFixtureContext({}))
    expect(
      out.files.some((f) => f.relativePath.endsWith('opencode.json')),
    ).toBe(false)
  })
  it('emits skills as skills/<name>/SKILL.md files', async () => {
    const out = await generateOpenCode(
      buildFixtureContext({
        skills: [
          {
            frontmatter: {
              name: 'test-skill',
              group: 'universal',
              description: 'A test skill',
              trigger: [],
              preferred_model: 'claude-opus-4-5',
              preferred_effort: 'medium',
              inputs: [],
              outputs: [],
              tools: [],
              chains: [],
              language: 'universal',
              tags: [],
              aliases: [],
              isHidden: false,
            },
            body: '# Test skill',
            sourcePath: '/dev/null',
            tier: 'universal',
          },
        ],
      }),
    )
    const paths = out.files.map((f) => f.relativePath)
    expect(paths.some((p) => p.startsWith('skills/'))).toBe(true)
  })
})
