import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  HOOK_KIND_TO_OC_EVENT,
  UNMAPPED_OC_HOOKS,
} from '../../src/core/manifest-schema/opencode.js'

// Resolve doc path relative to the workspace root (not the test file location)
const workspaceRoot = resolve(import.meta.dirname, '..', '..')
const docPath = resolve(workspaceRoot, 'docs', 'opencode-plugin.md')
const doc = readFileSync(docPath, 'utf-8')

// Wired OpenCode lifecycle handler keys. MUST be updated whenever
// src/opencode-plugin/index.ts adds or removes a handler.
const WIRED_OC_HANDLERS = [
  'config',
  'tool.execute.before',
  'tool.execute.after',
  'experimental.chat.messages.transform',
] as const

describe('docs/opencode-plugin.md coverage', () => {
  it('documents every wired OpenCode lifecycle handler', () => {
    for (const handler of WIRED_OC_HANDLERS) {
      expect(doc, `doc is missing wired handler: ${handler}`).toContain(handler)
    }
  })

  it('lists every mapped Anvil hook kind', () => {
    for (const kind of Object.keys(HOOK_KIND_TO_OC_EVENT)) {
      expect(doc, `doc is missing mapped hook kind: ${kind}`).toContain(kind)
    }
  })

  it('lists every unmapped Anvil hook kind', () => {
    for (const kind of UNMAPPED_OC_HOOKS) {
      expect(doc, `doc is missing unmapped hook kind: ${kind}`).toContain(kind)
    }
  })

  it('contains the troubleshooting anchor', () => {
    expect(doc).toMatch(/^##+\s+Troubleshooting/m)
  })

  it('uses no legacy "forge" naming', () => {
    expect(doc).not.toMatch(/forge|@forge\//i)
  })
})
