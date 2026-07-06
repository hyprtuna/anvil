import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { stageAnvilHome } from '../../src/installer/stage.js'
import { buildFixtureContext } from '../helpers/fixtures.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')

describe('stageAnvilHome', () => {
  it('produces both platform plugin roots plus canonical payload', async () => {
    const skillPath = join(REPO_ROOT, 'skills', 'universal', 'development.md')
    const ctx = buildFixtureContext({
      skills: [
        {
          frontmatter: {
            name: 'development',
            group: 'development',
            description: 'General-purpose coding assistant',
            trigger: ['implement'],
            when: [],
            aliases: [],
            isHidden: false,
          },
          body: '# Developer\n',
          sourcePath: skillPath,
          tier: 'universal',
        },
      ],
    })
    const out = await stageAnvilHome(ctx)
    const rels = out.files.map((f) => f.relativePath).sort()
    expect(rels).toContain('skills/development/SKILL.md')
    expect(rels).toContain('.claude-plugin/marketplace.json')
    expect(rels).toContain('plugins/claude-code/.claude-plugin/plugin.json')
    expect(rels).toContain('plugins/opencode/package.json')
    expect(rels).toContain('plugins/opencode/index.js')
    expect(rels).toContain('version')
  })

  it('stages slash commands into canonical commands/ (v0.2.3)', async () => {
    // Regression: CC adapter emits commands/<name>.md files; stage.ts used to
    // drop them under the mistaken assumption that OpenCode would emit canonical
    // copies. OpenCode does not emit commands, so the staged layout must carry
    // the CC-emitted ones or `~/.anvil/commands/` stays empty after install.
    const out = await stageAnvilHome(buildFixtureContext({}))
    const commandFiles = out.files
      .map((f) => f.relativePath)
      .filter((p) => p.startsWith('commands/'))
    expect(commandFiles.length).toBeGreaterThan(0)
    expect(commandFiles.every((p) => p.endsWith('.md'))).toBe(true)
  })

  it('symlinks platform views to canonical payload', async () => {
    const out = await stageAnvilHome(buildFixtureContext({}))
    const ccSkills = out.symlinks.find(
      (s) => s.linkPath === 'plugins/claude-code/skills',
    )
    expect(ccSkills?.target).toBe('../../skills')
    const ocSkills = out.symlinks.find(
      (s) => s.linkPath === 'plugins/opencode/skills',
    )
    expect(ocSkills?.target).toBe('../../skills')
  })
})
