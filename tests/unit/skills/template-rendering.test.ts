import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Skill } from '../../../src/core/types.js'
import { renderSkillBody } from '../../../src/skills/body.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

describe('renderSkillBody — ${TEMPLATE:<kind>} substitution', () => {
  let tmp: string
  let anvilRoot: string
  let userRoot: string

  beforeEach(() => {
    tmp = createTestTmpDir('anvil-render')
    anvilRoot = join(tmp, 'bundle')
    userRoot = join(tmp, 'home', '.anvil')
    mkdirSync(join(anvilRoot, 'templates', 'decisions'), { recursive: true })
    writeFileSync(
      join(anvilRoot, 'templates', 'decisions', 'default.md'),
      'BUNDLED-DECISIONS-BLOCK',
    )
  })

  function makeSkill(body: string): Skill {
    return {
      frontmatter: {
        name: 'test-skill',
        kind: 'atomic',
        group: 'test',
        description: 'fixture',
        trigger: [],
        preferred_model: 'sonnet',
        preferred_effort: 'medium',
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
        breaking_changes_in: [],
        userInvocable: false,
        disableModelInvocation: false,
        argumentHint: undefined,
        allowedTools: undefined,
        sourceProvenance: 'unknown',
        provenanceConfidence: undefined,
        createdAt: undefined,
        // biome-ignore lint/suspicious/noExplicitAny: fixture cast for test-only construction
      } as any,
      body,
      sourcePath: '/tmp/fixture.md',
      tier: 'universal',
      // biome-ignore lint/suspicious/noExplicitAny: fixture cast for test-only construction
    } as any
  }

  it('substitutes ${TEMPLATE:<kind>} with bundled template content', async () => {
    const skill = makeSkill('header\n\n${TEMPLATE:decisions}\n\nfooter')
    const out = await renderSkillBody(skill, {
      anvilRoot,
      projectRoot: tmp,
      scope: 'project',
    })
    expect(out).toBe('header\n\nBUNDLED-DECISIONS-BLOCK\n\nfooter')
  })

  it('user override wins over bundled', async () => {
    mkdirSync(join(userRoot, 'templates', 'decisions'), { recursive: true })
    writeFileSync(
      join(userRoot, 'templates', 'decisions', 'default.md'),
      'USER-OVERRIDE',
    )
    const skill = makeSkill('A ${TEMPLATE:decisions} B')
    const out = await renderSkillBody(skill, {
      anvilRoot,
      projectRoot: tmp,
      scope: 'project',
      userRoot,
    })
    expect(out).toBe('A USER-OVERRIDE B')
  })

  it('templates pass runs before artefact-path tokens (composition)', async () => {
    // The bundled template references an artefact-path token. After the
    // templates pass splices it in, the artefact-path pass should resolve it.
    mkdirSync(join(anvilRoot, 'templates', 'plans'), { recursive: true })
    writeFileSync(
      join(anvilRoot, 'templates', 'plans', 'default.md'),
      'plans go under ${ANVIL_PLANS_DIR}',
    )
    const skill = makeSkill('Save plan to: ${TEMPLATE:plans}')
    const out = await renderSkillBody(skill, {
      anvilRoot,
      projectRoot: tmp,
      scope: 'project',
    })
    expect(out).toBe(`Save plan to: plans go under ${tmp}/.anvil/plans`)
  })

  it('unknown template kinds pass through verbatim (lenient)', async () => {
    const skill = makeSkill('one ${TEMPLATE:absent} two')
    const out = await renderSkillBody(skill, {
      anvilRoot,
      projectRoot: tmp,
      scope: 'project',
    })
    expect(out).toBe('one ${TEMPLATE:absent} two')
  })

  it('surface-specific variant wins over default when surface is supplied', async () => {
    writeFileSync(
      join(anvilRoot, 'templates', 'decisions', 'opencode.md'),
      'OPENCODE-VARIANT',
    )
    const skill = makeSkill('${TEMPLATE:decisions}')
    const out = await renderSkillBody(skill, {
      anvilRoot,
      projectRoot: tmp,
      scope: 'project',
      surface: 'opencode',
    })
    expect(out).toBe('OPENCODE-VARIANT')
  })

  describe('auto-mode banner', () => {
    it('appends an auto-mode banner when runtimeContext.autoMode=true and body references decisions', async () => {
      const skill = makeSkill('${TEMPLATE:decisions}')
      const out = await renderSkillBody(skill, {
        anvilRoot,
        projectRoot: tmp,
        scope: 'project',
        runtimeContext: { autoMode: true, acceptDefaults: false },
      })
      expect(out).toContain('BUNDLED-DECISIONS-BLOCK')
      expect(out).toContain('<!-- anv-0176 -->')
      expect(out).toContain('Auto-mode active (autoMode=on)')
    })

    it('lists both flags in the banner when both are on', async () => {
      const skill = makeSkill('${TEMPLATE:decisions}')
      const out = await renderSkillBody(skill, {
        anvilRoot,
        projectRoot: tmp,
        scope: 'project',
        runtimeContext: { autoMode: true, acceptDefaults: true },
      })
      expect(out).toContain('autoMode=on')
      expect(out).toContain('acceptDefaults=on')
    })

    it('emits banner when only acceptDefaults is on', async () => {
      const skill = makeSkill('${TEMPLATE:decisions}')
      const out = await renderSkillBody(skill, {
        anvilRoot,
        projectRoot: tmp,
        scope: 'project',
        runtimeContext: { autoMode: false, acceptDefaults: true },
      })
      expect(out).toContain('<!-- anv-0176 -->')
      expect(out).toContain('acceptDefaults=on')
      expect(out).not.toContain('autoMode=on')
    })

    it('omits banner when both flags are false', async () => {
      const skill = makeSkill('${TEMPLATE:decisions}')
      const out = await renderSkillBody(skill, {
        anvilRoot,
        projectRoot: tmp,
        scope: 'project',
        runtimeContext: { autoMode: false, acceptDefaults: false },
      })
      expect(out).not.toContain('<!-- anv-0176 -->')
    })

    it('omits banner when body does not reference the decisions template', async () => {
      const skill = makeSkill('a body without any template refs')
      const out = await renderSkillBody(skill, {
        anvilRoot,
        projectRoot: tmp,
        scope: 'project',
        runtimeContext: { autoMode: true, acceptDefaults: true },
      })
      expect(out).not.toContain('<!-- anv-0176 -->')
    })

    it('omits banner when runtimeContext is undefined (back-compat)', async () => {
      const skill = makeSkill('${TEMPLATE:decisions}')
      const out = await renderSkillBody(skill, {
        anvilRoot,
        projectRoot: tmp,
        scope: 'project',
      })
      expect(out).toBe('BUNDLED-DECISIONS-BLOCK')
    })
  })
})
