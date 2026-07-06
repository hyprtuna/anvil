import type { AdapterContext } from '../../src/adapters/interface.js'
import type { RegisteredHook } from '../../src/core/registry/hook-registry.js'

interface FixtureOverrides {
  hooks?: RegisteredHook[]
  skills?: AdapterContext['skills']
  agents?: AdapterContext['agents']
}

export function buildFixtureContext(
  overrides: FixtureOverrides = {},
): AdapterContext {
  return {
    skills: overrides.skills ?? [],
    agents: overrides.agents ?? [],
    hooks: overrides.hooks ?? [],
    config: { version: '0.0.0' } as never,
    scope: 'global',
    home: '/tmp/test-home',
    cwd: '/tmp/test-cwd',
  }
}
