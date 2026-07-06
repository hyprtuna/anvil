import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ClaudeCodePluginManifest,
  PLUGIN_MANIFEST_SCHEMA_URL,
} from '../../../../src/core/manifest-schema/claude-code.js'

const FIXTURE_DIR = join(process.cwd(), 'tests/fixtures')
const CC_MANIFEST_SAMPLE = join(FIXTURE_DIR, 'cc-manifest-schema-sample.json')

describe('core/manifest-schema/claude-code', () => {
  it('accepts an Anvil-style v1 manifest (schemaVersion + core fields)', () => {
    const parsed = ClaudeCodePluginManifest.parse({
      schemaVersion: 1,
      name: 'anvil',
      version: '0.2.0',
      description: 'x',
    })
    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.name).toBe('anvil')
  })

  it('accepts the claude-mem reference manifest when wrapped with schemaVersion', async () => {
    const raw = await readFile(CC_MANIFEST_SAMPLE, 'utf-8')
    const parsed = ClaudeCodePluginManifest.parse({
      schemaVersion: 1,
      ...JSON.parse(raw),
    })
    expect(parsed.name).toBeTruthy()
    expect(parsed.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('requires name, version, and schemaVersion', () => {
    expect(() => ClaudeCodePluginManifest.parse({})).toThrow()
    expect(() => ClaudeCodePluginManifest.parse({ name: 'x' })).toThrow()
    expect(() =>
      ClaudeCodePluginManifest.parse({
        name: 'x',
        version: '1.0.0',
        description: 'y',
      }),
    ).toThrow()
  })

  it('rejects schemaVersion other than 1', () => {
    expect(() =>
      ClaudeCodePluginManifest.parse({
        schemaVersion: 2,
        name: 'anvil',
        version: '0.1.0',
        description: 'x',
      }),
    ).toThrow()
  })

  it('rejects non-semver version', () => {
    expect(() =>
      ClaudeCodePluginManifest.parse({
        schemaVersion: 1,
        name: 'anvil',
        version: 'beta',
        description: 'x',
      }),
    ).toThrow()
  })

  it('accepts an optional $schema pointing to the v1 JSON Schema URL', () => {
    const parsed = ClaudeCodePluginManifest.parse({
      $schema: PLUGIN_MANIFEST_SCHEMA_URL,
      schemaVersion: 1,
      name: 'anvil',
      version: '0.2.0',
      description: 'x',
    })
    expect(parsed.$schema).toBe(PLUGIN_MANIFEST_SCHEMA_URL)
  })

  it('rejects a $schema URL that does not match the pinned literal', () => {
    expect(() =>
      ClaudeCodePluginManifest.parse({
        $schema: 'https://example.com/other-schema.json',
        schemaVersion: 1,
        name: 'anvil',
        version: '0.2.0',
        description: 'x',
      }),
    ).toThrow()
  })

  it('accepts hooks as event-keyed record of matcher-wrapper arrays', () => {
    const parsed = ClaudeCodePluginManifest.parse({
      schemaVersion: 1,
      name: 'anvil',
      version: '0.1.0',
      description: 'x',
      hooks: {
        SessionStart: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: '${CLAUDE_PLUGIN_ROOT}/hooks/session-start.cjs',
              },
            ],
          },
        ],
      },
    })
    expect(parsed.hooks?.SessionStart?.[0].hooks?.[0].command).toContain(
      'session-start.cjs',
    )
  })

  it('rejects the old Anvil shape (hooks as array of {kind, script})', () => {
    expect(() =>
      ClaudeCodePluginManifest.parse({
        schemaVersion: 1,
        name: 'anvil',
        version: '0.1.0',
        description: 'x',
        hooks: [
          {
            kind: 'session-start',
            script: '.claude/hooks/session-start.cjs',
            enabled: true,
          },
        ],
      }),
    ).toThrow()
  })
})
