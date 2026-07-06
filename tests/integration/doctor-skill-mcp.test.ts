/**
 * ANV-0037 — doctor row "Skill MCP providers" reports missing commands as warn.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pushSkillMcpProvidersCheck } from '../../src/commands/cli/doctor-checks/skill-mcp-providers.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

interface Row {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
}

const baseFm = `---
name: mcp-demo
kind: atomic
group: development
description: demo
preferred_model: claude-sonnet-4-6
preferred_effort: medium
`

describe('integration/doctor — Skill MCP providers', () => {
  let tmp: string
  let skillsRoot: string

  beforeEach(async () => {
    tmp = createTestTmpDir('doctor-mcp')
    skillsRoot = join(tmp, 'skills', 'universal')
    await mkdir(skillsRoot, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  it('emits skip row when no skill declares mcp_servers', async () => {
    await writeFile(join(skillsRoot, 'plain.md'), `${baseFm}---\n\nbody\n`)
    const rows: Row[] = []
    await pushSkillMcpProvidersCheck(rows, tmp)
    const row = rows.find((r) => r.name.toLowerCase().includes('skill mcp'))
    expect(row?.status).toBe('skip')
  })

  it('warns when a declared command is not on PATH', async () => {
    await writeFile(
      join(skillsRoot, 'has-mcp.md'),
      `${baseFm}mcp_servers:\n  - name: ghost\n    command: definitely-not-on-path-zzz\n---\n\nbody\n`,
    )
    const rows: Row[] = []
    await pushSkillMcpProvidersCheck(rows, tmp)
    const row = rows.find((r) => r.name.toLowerCase().includes('skill mcp'))
    expect(row?.status).toBe('warn')
  })

  it('passes when declared command is on PATH (sh is standard)', async () => {
    await writeFile(
      join(skillsRoot, 'has-mcp.md'),
      `${baseFm}mcp_servers:\n  - name: shell-srv\n    command: sh\n---\n\nbody\n`,
    )
    const rows: Row[] = []
    await pushSkillMcpProvidersCheck(rows, tmp)
    const row = rows.find((r) => r.name.toLowerCase().includes('skill mcp'))
    expect(row?.status).toBe('pass')
  })
})
