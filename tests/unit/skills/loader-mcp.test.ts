/**
 * ANV-0037 — loader parses mcp_servers in frontmatter and merges mcp.json sidecar.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadSkillFile } from '../../../src/skills/loader.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

const baseFm = `---
name: mcp-demo
kind: atomic
group: development
description: demo for ANV-0037
preferred_model: claude-sonnet-4-6
preferred_effort: medium
`

describe('skills/loader — MCP metadata + sidecar', () => {
  let work: string

  beforeEach(() => {
    work = createTestTmpDir('anv-0037-loader')
  })

  afterEach(() => {
    rmSync(work, { recursive: true, force: true })
  })

  it('skill without MCP fields loads (back-compat)', async () => {
    const path = join(work, 'plain.md')
    writeFileSync(path, `${baseFm}---\n\nbody\n`)
    const skill = await loadSkillFile(path, 'universal')
    expect(skill).toBeDefined()
    expect(skill?.frontmatter.mcp_servers).toBeUndefined()
  })

  it('skill with mcp_servers in frontmatter loads', async () => {
    const path = join(work, 'fm-mcp.md')
    writeFileSync(
      path,
      `${baseFm}mcp_servers:\n  - name: graphify\n    command: graphify\n---\n\nbody\n`,
    )
    const skill = await loadSkillFile(path, 'universal')
    expect(skill).toBeDefined()
    expect(skill?.frontmatter.mcp_servers).toHaveLength(1)
    expect(skill?.frontmatter.mcp_servers?.[0]?.name).toBe('graphify')
  })

  it('subdir skill with sidecar mcp.json merges into mcp_servers', async () => {
    const subdir = join(work, 'sk')
    mkdirSync(subdir, { recursive: true })
    writeFileSync(join(subdir, 'SKILL.md'), `${baseFm}---\n\nbody\n`)
    writeFileSync(
      join(subdir, 'mcp.json'),
      JSON.stringify([{ name: 'side', command: 'sh' }]),
    )
    const skill = await loadSkillFile(join(subdir, 'SKILL.md'), 'universal')
    expect(skill).toBeDefined()
    expect(skill?.frontmatter.mcp_servers?.some((s) => s.name === 'side')).toBe(
      true,
    )
  })

  it('sidecar wins on name collision', async () => {
    const subdir = join(work, 'sk')
    mkdirSync(subdir, { recursive: true })
    writeFileSync(
      join(subdir, 'SKILL.md'),
      `${baseFm}mcp_servers:\n  - name: srv\n    command: fm-cmd\n---\n\nbody\n`,
    )
    writeFileSync(
      join(subdir, 'mcp.json'),
      JSON.stringify([{ name: 'srv', command: 'sidecar-cmd' }]),
    )
    const skill = await loadSkillFile(join(subdir, 'SKILL.md'), 'universal')
    const srv = skill?.frontmatter.mcp_servers?.find((s) => s.name === 'srv')
    expect(srv && 'command' in srv && srv.command).toBe('sidecar-cmd')
  })
})
