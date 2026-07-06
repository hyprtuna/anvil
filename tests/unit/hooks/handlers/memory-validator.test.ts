/**
 * Tests for memory-validator PreToolUse handler (ANV-0125).
 *
 * Coverage:
 *   1. Edit that drops a section from AGENTS.md is denied.
 *   2. Legitimate addition (new section, new table row) is allowed.
 *   3. Stub-file integrity — edit that changes CLAUDE.md away from the
 *      2-line stub is denied.
 *   4. --allow-restructure bypass works (env var + payload flag).
 *
 * Plus failure-mode coverage (malformed payload, unrelated tool, non-memory file).
 */
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import type { HookKind } from '../../../../src/core/types.js'
import { memoryValidatorHandler } from '../../../../src/hooks/handlers/memory-validator.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

let workDir: string

beforeEach(() => {
  workDir = createTestTmpDir('memval')
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
  process.env.ANVIL_ALLOW_RESTRUCTURE = undefined
})

function makeCtx(payload: unknown, env: Record<string, string> = {}) {
  return {
    kind: 'pre-tool-use' as HookKind,
    cwd: workDir,
    config: buildDefaultConfig(),
    env,
    payload,
  }
}

function editPayload(filePath: string, oldStr: string, newStr: string) {
  return {
    session_id: 'test-session',
    tool_name: 'Edit',
    tool_input: {
      file_path: filePath,
      old_string: oldStr,
      new_string: newStr,
    },
  }
}

function writePayload(filePath: string, content: string) {
  return {
    session_id: 'test-session',
    tool_name: 'Write',
    tool_input: {
      file_path: filePath,
      content,
    },
  }
}

function multiEditPayload(
  filePath: string,
  edits: Array<{ old_string: string; new_string: string }>,
) {
  return {
    session_id: 'test-session',
    tool_name: 'MultiEdit',
    tool_input: {
      file_path: filePath,
      edits,
    },
  }
}

// ─── Invariant 1: AGENTS.md section drop is denied ───────────────────────────

describe('memory-validator: AGENTS.md section drops', () => {
  it('denies an edit that drops a table heading', async () => {
    const agentsPath = join(workDir, 'AGENTS.md')
    const original = [
      '# Folder Guide',
      '',
      'Intro prose.',
      '',
      '| Path | Purpose |',
      '|---|---|',
      '| a | b |',
      '',
    ].join('\n')
    writeFileSync(agentsPath, original)

    const result = await memoryValidatorHandler(
      makeCtx(
        editPayload(agentsPath, original, '# Folder Guide\n\nIntro prose.\n'),
      ),
    )
    expect(result.exitCode).toBe(2)
    expect(result.message).toContain('table-heading-dropped')
    expect(result.message).toContain('AGENTS.md')
  })

  it('denies an edit that drops the H1', async () => {
    const agentsPath = join(workDir, 'AGENTS.md')
    const original = '# Title\n\nBody.\n'
    writeFileSync(agentsPath, original)

    const result = await memoryValidatorHandler(
      makeCtx(editPayload(agentsPath, '# Title\n\n', '')),
    )
    expect(result.exitCode).toBe(2)
    expect(result.message).toContain('missing-h1')
  })
})

// ─── Invariant: legitimate additions are allowed ─────────────────────────────

describe('memory-validator: legitimate additions', () => {
  it('allows adding a new section to AGENTS.md', async () => {
    const agentsPath = join(workDir, 'AGENTS.md')
    const original = '# Title\n\nBody.\n'
    writeFileSync(agentsPath, original)

    const result = await memoryValidatorHandler(
      makeCtx(
        editPayload(
          agentsPath,
          'Body.\n',
          'Body.\n\n## New Section\n\nDetail.\n',
        ),
      ),
    )
    expect(result.exitCode).toBe(0)
    expect(result.context?.memoryValidatorPassed).toBe(true)
  })

  it('allows adding a row to an existing table', async () => {
    const agentsPath = join(workDir, 'AGENTS.md')
    const original = [
      '# Title',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '',
    ].join('\n')
    writeFileSync(agentsPath, original)

    const result = await memoryValidatorHandler(
      makeCtx(editPayload(agentsPath, '| 1 | 2 |\n', '| 1 | 2 |\n| 3 | 4 |\n')),
    )
    expect(result.exitCode).toBe(0)
  })
})

// ─── Invariant 3: CLAUDE.md stub integrity ───────────────────────────────────

describe('memory-validator: CLAUDE.md stub integrity', () => {
  it('denies an edit that breaks the CLAUDE.md stub', async () => {
    const dir = workDir
    writeFileSync(join(dir, 'AGENTS.md'), '# Real Content\n\nBody.\n')
    const stubPath = join(dir, 'CLAUDE.md')
    writeFileSync(stubPath, '@./AGENTS.md\n')

    const result = await memoryValidatorHandler(
      makeCtx(
        writePayload(
          stubPath,
          '# Inlined Content\n\nBody pasted into the stub.\n',
        ),
      ),
    )
    expect(result.exitCode).toBe(2)
    expect(result.message).toContain('stub-broken')
    expect(result.message).toContain('AGENTS.md')
  })

  it('allows preserving the CLAUDE.md stub (with new comment)', async () => {
    const dir = workDir
    writeFileSync(join(dir, 'AGENTS.md'), '# Real Content\n')
    const stubPath = join(dir, 'CLAUDE.md')
    writeFileSync(stubPath, '@./AGENTS.md\n')

    const result = await memoryValidatorHandler(
      makeCtx(
        writePayload(stubPath, '<!-- updated comment -->\n@./AGENTS.md\n'),
      ),
    )
    expect(result.exitCode).toBe(0)
  })

  it('skips stub-parity check when no sibling AGENTS.md exists', async () => {
    const dir = workDir
    // No AGENTS.md sibling — unpaired CLAUDE.md is treated as a regular
    // memory file (H1 / table checks apply, stub check does not).
    const path = join(dir, 'CLAUDE.md')
    writeFileSync(path, '# Some Project\n\nIntro.\n')

    const result = await memoryValidatorHandler(
      makeCtx(
        editPayload(path, 'Intro.\n', 'Intro.\n\nMore prose under H1.\n'),
      ),
    )
    expect(result.exitCode).toBe(0)
  })
})

// ─── Bypass: --allow-restructure ─────────────────────────────────────────────

describe('memory-validator: --allow-restructure bypass', () => {
  it('bypasses checks when ANVIL_ALLOW_RESTRUCTURE=1 is in ctx.env', async () => {
    const agentsPath = join(workDir, 'AGENTS.md')
    writeFileSync(agentsPath, '# Title\n\n| A | B |\n|---|---|\n| 1 | 2 |\n')

    const result = await memoryValidatorHandler(
      makeCtx(
        editPayload(
          agentsPath,
          '# Title\n\n| A | B |\n|---|---|\n| 1 | 2 |\n',
          'Nuked.',
        ),
        { ANVIL_ALLOW_RESTRUCTURE: '1' },
      ),
    )
    expect(result.exitCode).toBe(0)
    expect(result.context?.bypassed).toBe(true)
  })

  it('bypasses checks when payload.allow_restructure=true', async () => {
    const agentsPath = join(workDir, 'AGENTS.md')
    writeFileSync(agentsPath, '# Title\n')

    const payload = {
      ...editPayload(agentsPath, '# Title\n', ''),
      allow_restructure: true,
    }
    const result = await memoryValidatorHandler(makeCtx(payload))
    expect(result.exitCode).toBe(0)
    expect(result.context?.bypassed).toBe(true)
  })

  it('bypasses checks when process.env.ANVIL_ALLOW_RESTRUCTURE=1', async () => {
    process.env.ANVIL_ALLOW_RESTRUCTURE = '1'
    const agentsPath = join(workDir, 'AGENTS.md')
    writeFileSync(agentsPath, '# Title\n')

    const result = await memoryValidatorHandler(
      makeCtx(editPayload(agentsPath, '# Title\n', '')),
    )
    expect(result.exitCode).toBe(0)
  })
})

// ─── MultiEdit support ───────────────────────────────────────────────────────

describe('memory-validator: MultiEdit', () => {
  it('applies all edits sequentially and denies when invariants violated', async () => {
    const agentsPath = join(workDir, 'AGENTS.md')
    writeFileSync(agentsPath, '# Title\n\n| A | B |\n|---|---|\n| 1 | 2 |\n')

    const result = await memoryValidatorHandler(
      makeCtx(
        multiEditPayload(agentsPath, [
          { old_string: '# Title\n', new_string: '' },
          { old_string: '| A | B |\n|---|---|\n| 1 | 2 |\n', new_string: '' },
        ]),
      ),
    )
    expect(result.exitCode).toBe(2)
    // Both invariants should trip
    const kinds = result.context?.violationKinds as string[]
    expect(kinds).toContain('missing-h1')
    expect(kinds).toContain('table-heading-dropped')
  })

  it('allows MultiEdit that only adds content', async () => {
    const agentsPath = join(workDir, 'AGENTS.md')
    writeFileSync(agentsPath, '# Title\n\nBody.\n')

    const result = await memoryValidatorHandler(
      makeCtx(
        multiEditPayload(agentsPath, [
          { old_string: 'Body.\n', new_string: 'Body.\n\n## New\n\nDetail.\n' },
        ]),
      ),
    )
    expect(result.exitCode).toBe(0)
  })
})

// ─── Failure-mode coverage ───────────────────────────────────────────────────

describe('memory-validator: benign cases', () => {
  it('allows edits to non-memory files', async () => {
    const filePath = join(workDir, 'README.md')
    writeFileSync(filePath, '# README\n')
    const result = await memoryValidatorHandler(
      makeCtx(editPayload(filePath, '# README\n', 'Empty.')),
    )
    expect(result.exitCode).toBe(0)
  })

  it('allows when payload is malformed', async () => {
    const result = await memoryValidatorHandler(makeCtx(null))
    expect(result.exitCode).toBe(0)
  })

  it('allows when tool name is unrelated (Bash)', async () => {
    const result = await memoryValidatorHandler(
      makeCtx({ tool_name: 'Bash', tool_input: { command: 'ls' } }),
    )
    expect(result.exitCode).toBe(0)
  })

  it('allows when file_path is missing', async () => {
    const result = await memoryValidatorHandler(
      makeCtx({
        tool_name: 'Edit',
        tool_input: { old_string: 'x', new_string: 'y' },
      }),
    )
    expect(result.exitCode).toBe(0)
  })
})
