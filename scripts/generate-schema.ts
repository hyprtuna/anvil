#!/usr/bin/env bun
/**
 * Generates src/core/manifest-schema/v1.schema.json from the Zod source.
 * Run via `bun run generate:schema` or `bun scripts/generate-schema.ts`.
 * The JSON output is committed; CI regenerates and diffs to catch drift.
 */
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { ClaudeCodePluginManifest } from '../src/core/manifest-schema/claude-code.js'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(
  here,
  '..',
  'src',
  'core',
  'manifest-schema',
  'v1.schema.json',
)

const schema = zodToJsonSchema(ClaudeCodePluginManifest, {
  name: 'ClaudeCodePluginManifest',
  $refStrategy: 'none',
})

// Stable key ordering so diffs are readable and reproducible across versions.
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

const serialized = `${JSON.stringify(sortKeys(schema), null, 2)}\n`
writeFileSync(out, serialized)
console.log(`wrote ${out}`)
