import { describe, expect, it } from 'vitest'
import { buildPluginManifest } from '../../src/adapters/claude-code/manifest.js'
import { buildAnvilMarketplace } from '../../src/adapters/claude-code/marketplace.js'
import type { HookContext, HookResult } from '../../src/core/types.js'
import { buildFixtureContext } from '../helpers/fixtures.js'

const noop = async (_ctx: HookContext): Promise<HookResult> => ({
  exitCode: 0,
})

describe('Claude Code manifest', () => {
  it('emits hooks keyed by CC event name with ${CLAUDE_PLUGIN_ROOT} anchor', () => {
    const m = buildPluginManifest(
      buildFixtureContext({
        hooks: [
          { kind: 'session-start', enabled: true, name: 'test', handler: noop },
        ],
      }),
    )
    expect(m.hooks?.SessionStart?.[0]?.hooks?.[0]?.command).toMatch(
      /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/session-start\.cjs/,
    )
  })
  it('drops hooks with no CC event mapping', () => {
    const m = buildPluginManifest(
      buildFixtureContext({
        hooks: [
          { kind: 'pre-commit', enabled: true, name: 'test', handler: noop },
        ],
      }),
    )
    expect(m.hooks ?? {}).toEqual({})
  })
  it('skips disabled hooks', () => {
    const m = buildPluginManifest(
      buildFixtureContext({
        hooks: [
          {
            kind: 'session-start',
            enabled: false,
            name: 'test',
            handler: noop,
          },
        ],
      }),
    )
    expect(m.hooks ?? {}).toEqual({})
  })
})

describe('Anvil local marketplace', () => {
  it('has a single plugin pointing at ./plugins/claude-code', () => {
    const mp = buildAnvilMarketplace(buildFixtureContext({}))
    expect(mp.plugins).toHaveLength(1)
    expect(mp.plugins[0].source).toBe('./plugins/claude-code')
  })
})
