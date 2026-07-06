/**
 * Plan 31 B5 — installer writes .claude/rules/anvil-routing.md
 *
 * Tests the writeRoutingRules() helper in isolation against a temp directory.
 */
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ANVIL_ROUTING_RULES_CONTENT } from '../../src/core/routing-rules-content.js'
import { writeRoutingRules } from '../../src/installer/install.js'

let tmpDir: string

beforeEach(async () => {
  const base = join(
    tmpdir(),
    `anvil-b5-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await mkdir(base, { recursive: true })
  tmpDir = base
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

const RULES_PATH = () => join(tmpDir, '.claude', 'rules', 'anvil-routing.md')
const NEW_PATH = () => `${RULES_PATH()}.new`

describe('writeRoutingRules — Plan 31 B5', () => {
  it('writes canonical content on fresh install', async () => {
    const warning = await writeRoutingRules(tmpDir, false)
    expect(warning).toBeNull()
    const content = await readFile(RULES_PATH(), 'utf-8')
    expect(content).toBe(ANVIL_ROUTING_RULES_CONTENT)
  })

  it('skips silently when file is byte-identical to canonical', async () => {
    // First write
    await writeRoutingRules(tmpDir, false)
    const mtimeBefore = (await stat(RULES_PATH())).mtimeMs

    // Small delay to ensure mtime would differ if file was rewritten
    await new Promise((r) => setTimeout(r, 20))

    const warning = await writeRoutingRules(tmpDir, false)
    expect(warning).toBeNull()

    const mtimeAfter = (await stat(RULES_PATH())).mtimeMs
    // mtime should be unchanged since we skipped the write
    expect(mtimeAfter).toBe(mtimeBefore)
  })

  it('writes .new sibling and returns warning when file is divergent (no --force)', async () => {
    // Write a divergent file first
    await mkdir(join(tmpDir, '.claude', 'rules'), { recursive: true })
    await writeFile(RULES_PATH(), '# custom content', 'utf-8')

    const warning = await writeRoutingRules(tmpDir, false)
    expect(warning).not.toBeNull()
    expect(warning).toContain('anvil-routing.md.new')
    expect(warning).toContain('--force')

    // Original must be preserved
    const original = await readFile(RULES_PATH(), 'utf-8')
    expect(original).toBe('# custom content')

    // .new sibling must have canonical content
    const newContent = await readFile(NEW_PATH(), 'utf-8')
    expect(newContent).toBe(ANVIL_ROUTING_RULES_CONTENT)
  })

  it('overwrites divergent file when --force is set', async () => {
    // Write a divergent file first
    await mkdir(join(tmpDir, '.claude', 'rules'), { recursive: true })
    await writeFile(RULES_PATH(), '# custom content', 'utf-8')

    const warning = await writeRoutingRules(tmpDir, true)
    expect(warning).toBeNull()

    // File must now contain canonical content
    const content = await readFile(RULES_PATH(), 'utf-8')
    expect(content).toBe(ANVIL_ROUTING_RULES_CONTENT)
  })
})
