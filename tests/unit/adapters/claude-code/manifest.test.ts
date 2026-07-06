import { describe, expect, it } from 'vitest'
import { buildPluginManifest } from '../../../../src/adapters/claude-code/manifest.js'
import type { AdapterContext } from '../../../../src/adapters/interface.js'
import { ClaudeCodePluginManifest } from '../../../../src/core/manifest-schema/claude-code.js'

const ctx: AdapterContext = {
  cwd: '/tmp/x',
  scope: 'project',
  config: {} as never,
  skills: [],
  agents: [
    // @ts-expect-error minimal shape
    { frontmatter: { name: 'code-reviewer' }, sourcePath: '/x' },
  ],
  hooks: [
    { kind: 'session-start', enabled: true },
    { kind: 'pre-compact', enabled: false },
  ] as never,
}

describe('adapters/claude-code/manifest', () => {
  it('produces a schema-valid manifest', () => {
    const m = buildPluginManifest(ctx)
    expect(() => ClaudeCodePluginManifest.parse(m)).not.toThrow()
  })

  it('keys hooks by lifecycle event name, not by array index', () => {
    const m = buildPluginManifest(ctx)
    expect(m.hooks?.SessionStart).toBeDefined()
    expect(m.hooks?.SessionStart?.[0].hooks?.[0].command).toContain(
      'session-start.cjs',
    )
  })

  it('omits disabled hooks from the manifest', () => {
    const m = buildPluginManifest(ctx)
    expect(m.hooks?.PreCompact).toBeUndefined()
  })

  it('uses ${CLAUDE_PLUGIN_ROOT} so the plugin works from any install scope', () => {
    const m = buildPluginManifest(ctx)
    expect(m.hooks?.SessionStart?.[0].hooks?.[0].command).toContain(
      '${CLAUDE_PLUGIN_ROOT}',
    )
  })
})
