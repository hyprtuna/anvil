import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { ClaudeCodePluginManifest } from '../../../../src/core/manifest-schema/claude-code.js'

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    const keys = Object.keys(value as Record<string, unknown>).sort()
    for (const key of keys) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

describe('core/manifest-schema v1.schema.json drift', () => {
  it('committed v1.schema.json matches regenerated output', () => {
    const committed = readFileSync(
      join(process.cwd(), 'src', 'core', 'manifest-schema', 'v1.schema.json'),
      'utf-8',
    )
    const regenerated = `${JSON.stringify(
      sortKeys(
        zodToJsonSchema(ClaudeCodePluginManifest, {
          name: 'ClaudeCodePluginManifest',
          $refStrategy: 'none',
        }),
      ),
      null,
      2,
    )}\n`
    expect(committed).toBe(regenerated)
  })

  it('points $schema literal at the canonical v1 URL', () => {
    const schema = JSON.parse(
      readFileSync(
        join(process.cwd(), 'src', 'core', 'manifest-schema', 'v1.schema.json'),
        'utf-8',
      ),
    ) as {
      definitions: {
        ClaudeCodePluginManifest: {
          properties: Record<string, { const?: string }>
        }
      }
    }
    const dollarSchema =
      schema.definitions.ClaudeCodePluginManifest.properties.$schema
    expect(dollarSchema?.const).toBe(
      'https://anvil.dev/schemas/plugin-manifest/v1.json',
    )
  })
})
