/**
 * ANV-0003 — Unit tests for the agent-permission/class-scope doctor row.
 *
 * Builds a fixture agents/ tree on disk via `mkdtemp` + `writeFile` and runs
 * the runner directly. The doctor row uses the live `loadAllAgents` loader,
 * so the test exercises the full parse → classify → coverage path.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { agentPermissionCheck } from '../../../../../src/commands/cli/doctor-checks/agent-permission.js'
import type {
  DoctorCheckContext,
  DoctorCheckRow,
} from '../../../../../src/commands/cli/doctor-registry.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

function ctx(cwd: string): DoctorCheckContext {
  return {
    cwd,
    home: '/tmp/home',
    anvilHome: '/tmp/anvil-home',
    inProject: true,
    skipDetail: 'no agents/ tree in scope',
    installScope: 'unknown',
  }
}

function agentMd(name: string, tools: string, extra = ''): string {
  return `---
name: ${name}
description: test fixture agent for ANV-0003
tools: ${tools}
${extra}---

> Fixture agent body.

# ${name}
`
}

function makeWorkspace(): string {
  // ANV-0165: tmpdirs centralised under /tmp/anvil-tests/ via createTestTmpDir.
  return createTestTmpDir('anv-0003-agent-permission')
}

async function makeAgentsDir(cwd: string): Promise<string> {
  const agentsDir = join(cwd, 'agents')
  await mkdir(agentsDir, { recursive: true })
  return agentsDir
}

describe('agent-permission/class-scope', () => {
  it('emits skip when agents/ tree is absent', async () => {
    const cwd = makeWorkspace()
    const rows: DoctorCheckRow[] = []
    await agentPermissionCheck.runner(ctx(cwd), rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('skip')
  })

  it('emits pass when every agent is within its class scope', async () => {
    const cwd = makeWorkspace()
    const agentsDir = await makeAgentsDir(cwd)

    await writeFile(
      join(agentsDir, 'good-reviewer.md'),
      agentMd('good-reviewer', '[Read, Glob, Grep]'),
    )
    await writeFile(
      join(agentsDir, 'good-worker.md'),
      agentMd('good-worker', '[Read, Edit, Bash, Glob, Grep]'),
    )

    const rows: DoctorCheckRow[] = []
    await agentPermissionCheck.runner(ctx(cwd), rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('pass')
    expect(rows[0]?.detail).toContain('2/2')
  })

  it('emits warn when a read-only class carries Edit', async () => {
    const cwd = makeWorkspace()
    const agentsDir = await makeAgentsDir(cwd)

    await writeFile(
      join(agentsDir, 'good-worker.md'),
      agentMd('good-worker', '[Read, Edit, Bash]'),
    )
    await writeFile(
      join(agentsDir, 'bad-reviewer.md'),
      agentMd('bad-reviewer', '[Read, Edit, Glob]'),
    )

    const rows: DoctorCheckRow[] = []
    await agentPermissionCheck.runner(ctx(cwd), rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('warn')
    expect(rows[0]?.detail).toContain('bad-reviewer')
    expect(rows[0]?.detail).toContain('reviewer')
    expect(rows[0]?.detail).toContain('Edit')
  })

  it('treats disallowedTools as honoured (no warning when Edit is denied)', async () => {
    const cwd = makeWorkspace()
    const agentsDir = await makeAgentsDir(cwd)

    await writeFile(
      join(agentsDir, 'safe-reviewer.md'),
      agentMd(
        'safe-reviewer',
        '[Read, Edit, Glob, Grep]',
        'disallowedTools: [Edit]\n',
      ),
    )

    const rows: DoctorCheckRow[] = []
    await agentPermissionCheck.runner(ctx(cwd), rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('pass')
  })

  it('check is registered as silent on pass', () => {
    expect(agentPermissionCheck.silentOnPass).toBe(true)
    expect(agentPermissionCheck.category).toBe('agent-permission')
    expect(agentPermissionCheck.id).toBe('agent-permission/class-scope')
  })
})
