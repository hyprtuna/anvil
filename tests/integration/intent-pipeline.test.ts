import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadAllAgents } from '../../src/agents/load-all.js'
import { prepareInvocation } from '../../src/agents/runner.js'
import { buildDefaultConfig } from '../../src/core/config/defaults.js'
import { RoutingDecision } from '../../src/core/types.js'
import { userPromptSubmitHandler } from '../../src/hooks/handlers/user-prompt-submit.js'
import { route } from '../../src/intent/router.js'
import { loadAllSkills } from '../../src/skills/load-all.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')
const SKILLS_ROOT = join(REPO_ROOT, 'skills')
const AGENTS_ROOT = join(REPO_ROOT, 'agents')

describe('integration: intent pipeline (prompt → router → runner)', () => {
  it('user-prompt-submit hook attaches a valid RoutingDecision for a debug prompt', async () => {
    const result = await userPromptSubmitHandler({
      kind: 'user-prompt-submit',
      cwd: REPO_ROOT,
      config: buildDefaultConfig(),
      env: {},
      payload: 'debug the failing test suite',
    })
    expect(result.exitCode).toBe(0)
    const routing = (result.context as { routingDecision?: unknown })
      .routingDecision
    const parsed = RoutingDecision.parse(routing)
    expect(parsed.intent).toBe('debug')
    expect(parsed.skills).toContain('debugging')
    expect(parsed.rules.execution).toContain('verification-before-completion')
  })

  it('route() + prepareInvocation() builds a live prompt with routing preamble for a real agent', async () => {
    const [agents, skills] = await Promise.all([
      loadAllAgents({ agentsRoot: AGENTS_ROOT }),
      loadAllSkills({ skillsRoot: SKILLS_ROOT }),
    ])
    const routing = route('debug the failing tests', {
      availableSkills: new Set(skills.getAll().map((s) => s.frontmatter.name)),
      availableAgents: new Set(agents.getAll().map((a) => a.frontmatter.name)),
    })
    expect(routing.intent).toBe('debug')
    // `debugging` ships as a universal skill → router keeps it.
    expect(routing.skills).toContain('debugging')

    const invocation = prepareInvocation(
      agents,
      buildDefaultConfig(),
      'ultra-worker',
      'debug the failing tests',
      { routingDecision: routing },
    )
    expect(invocation.prompt).toContain('[routing]')
    expect(invocation.prompt).toContain('intent=debug')
    expect(invocation.prompt).toContain(
      'rules.execution=verification-before-completion',
    )
  })

  it('unrecognized prompts route to main fallback', async () => {
    const [agents, skills] = await Promise.all([
      loadAllAgents({ agentsRoot: AGENTS_ROOT }),
      loadAllSkills({ skillsRoot: SKILLS_ROOT }),
    ])
    const routing = route('good morning', {
      availableSkills: new Set(skills.getAll().map((s) => s.frontmatter.name)),
      availableAgents: new Set(agents.getAll().map((a) => a.frontmatter.name)),
    })
    expect(routing.fallback).toBe('main')
  })
})
