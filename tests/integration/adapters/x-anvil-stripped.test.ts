/**
 * ANV-0206 — Integration: x-anvil: not present in emitted adapter output.
 *
 * The `x-anvil:` block is an Anvil-internal namespace; host tools (CC, OC)
 * must never see it. This test asserts that neither claude-code nor opencode
 * adapter output contains `x-anvil:` in any emitted skill or agent file.
 */

import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { generateClaudeCode } from '../../../src/adapters/claude-code/generate.js'
import type { AdapterContext } from '../../../src/adapters/interface.js'
import { generateOpenCode } from '../../../src/adapters/opencode/generate.js'
import { loadAllAgents } from '../../../src/agents/load-all.js'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { loadSkillsFromDir } from '../../../src/skills/loader.js'

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const AGENTS_DIR = join(REPO_ROOT, 'agents')
const SKILLS_DIR = join(REPO_ROOT, 'skills', 'universal')

async function buildContext(): Promise<AdapterContext> {
  const registry = await loadAllAgents({ agentsRoot: AGENTS_DIR })
  const agents = registry.getAll()
  const skills = await loadSkillsFromDir(SKILLS_DIR, 'universal', {
    warnOnInvalid: false,
    lazy: false,
  })
  return {
    cwd: REPO_ROOT,
    scope: 'project',
    config: buildDefaultConfig(),
    skills,
    hooks: [],
    agents,
  }
}

describe('x-anvil: stripped from emitted adapter output', () => {
  it('claude-code: no emitted skill or agent file contains x-anvil:', async () => {
    const ctx = await buildContext()
    const out = await generateClaudeCode(ctx)

    const violations: string[] = []
    for (const file of out.files) {
      const content =
        typeof file.content === 'string'
          ? file.content
          : file.content.toString('utf-8')
      if (
        (file.relativePath.startsWith('skills/') ||
          file.relativePath.startsWith('agents/')) &&
        content.includes('x-anvil:')
      ) {
        violations.push(file.relativePath)
      }
    }

    expect(
      violations,
      `x-anvil: found in claude-code emitted files: ${violations.join(', ')}`,
    ).toHaveLength(0)
  })

  it('opencode: no emitted skill file contains x-anvil:', async () => {
    const ctx = await buildContext()
    const out = await generateOpenCode(ctx)

    const violations: string[] = []
    for (const file of out.files) {
      const content =
        typeof file.content === 'string'
          ? file.content
          : file.content.toString('utf-8')
      if (
        file.relativePath.startsWith('skills/') &&
        content.includes('x-anvil:')
      ) {
        violations.push(file.relativePath)
      }
    }

    expect(
      violations,
      `x-anvil: found in opencode emitted files: ${violations.join(', ')}`,
    ).toHaveLength(0)
  })
})
