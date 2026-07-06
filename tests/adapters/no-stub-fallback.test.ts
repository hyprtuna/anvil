import { describe, expect, it } from 'vitest'
import { generateClaudeCode } from '../../src/adapters/claude-code/generate.js'
import { generateOpenCode } from '../../src/adapters/opencode/generate.js'
import { buildFixtureContext } from '../helpers/fixtures.js'

describe('adapters: no silent stub fallback', () => {
  it('generateClaudeCode throws when a required hook .cjs is missing from dist-hooks/', async () => {
    const ctx = buildFixtureContext({
      hooks: [
        {
          kind: 'never-compiled-hook' as never,
          enabled: true,
          name: 'never-compiled-hook',
          handler: async () => ({ exitCode: 0 }),
        },
      ],
    })
    await expect(generateClaudeCode(ctx)).rejects.toThrow(
      /hook.*never-compiled-hook.*not built/i,
    )
  })

  it('generateOpenCode does NOT throw for hooks (routes through plugin loader, not dist-hooks — D-09)', async () => {
    // Post v0.11.2 Bundle D Phase 3: generateOpenCode no longer reads hooks from
    // dist-hooks/. Hook dispatch is wired through the OC plugin's tool.execute
    // handlers. A hook input with an unbuilt .cjs is silently accepted at the
    // generate layer (the plugin handles dispatch at runtime).
    const ctx = buildFixtureContext({
      hooks: [
        {
          kind: 'never-compiled-hook' as never,
          enabled: true,
          name: 'never-compiled-hook',
          handler: async () => ({ exitCode: 0 }),
        },
      ],
    })
    // Should resolve (not throw) — hooks no longer read from disk in this adapter
    const result = await generateOpenCode(ctx)
    const paths = result.files.map((f) => f.relativePath)
    expect(paths.some((p) => p.startsWith('hooks/'))).toBe(false)
  })
})
