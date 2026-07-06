import { rmSync, writeFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

describe('commands/cli/progress', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>
  let consoleSpy: ReturnType<typeof vi.spyOn>

  afterEach(() => {
    writeSpy?.mockRestore()
    consoleSpy?.mockRestore()
    vi.unstubAllEnvs()
  })

  it('buildProgressSummary returns structured data', async () => {
    const { buildProgressSummary } = await import(
      '../../../../src/commands/cli/progress.js'
    )
    const summary = buildProgressSummary()
    expect(summary).toHaveProperty('branch')
    expect(summary).toHaveProperty('uncommittedFiles')
    expect(typeof summary.branch).toBe('string')
  })

  it('buildProgressSummary includes cost field', async () => {
    const { buildProgressSummary } = await import(
      '../../../../src/commands/cli/progress.js'
    )
    const summary = buildProgressSummary()
    expect(summary).toHaveProperty('cost')
  })

  it('progressCommand emits JSON when requested', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const { progressCommand } = await import(
      '../../../../src/commands/cli/progress.js'
    )
    await progressCommand({ json: true })
    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    const parsed = JSON.parse(output)
    expect(parsed).toHaveProperty('branch')
    expect(parsed).toHaveProperty('recentCommits')
  })
})

// --- G.3 progress tests using fixture session.json ---

describe('commands/cli/progress — session.json fixture', () => {
  let tmpDir: string
  let origCwd: string
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmpDir = createTestTmpDir('progress-test')
    origCwd = process.cwd()
    // Redirect process.cwd() inside buildProgressSummary by chdir
    process.chdir(tmpDir)
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    process.chdir(origCwd)
    consoleSpy?.mockRestore()
    vi.resetModules()
    try {
      rmSync(tmpDir, { recursive: true })
    } catch {
      // ignore
    }
  })

  it('renders cost section when session.json contains valid data', async () => {
    mkdirSync(join(tmpDir, '.anvil'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.anvil', 'session.json'),
      JSON.stringify({
        tokensUsed: 1234,
        estimatedCostUsd: 0.0567,
        durationMs: 120_000,
        sessionStart: '2026-01-01T00:00:00.000Z',
      }),
    )

    const { progressCommand } = await import(
      '../../../../src/commands/cli/progress.js'
    )
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    await progressCommand({})
    writeSpy.mockRestore()

    // consoleSpy captures console.log calls (printKv and the heading use console.log)
    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(allOutput).toMatch(/1,234|1234/)
    expect(allOutput).toMatch(/Session cost/)
  })

  it('omits cost section when session.json is absent', async () => {
    const { progressCommand } = await import(
      '../../../../src/commands/cli/progress.js'
    )
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    await progressCommand({})
    writeSpy.mockRestore()

    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(allOutput).not.toMatch(/Session cost/)
    expect(allOutput).not.toMatch(/Tokens/)
  })

  it('gracefully skips cost section when session.json is malformed', async () => {
    mkdirSync(join(tmpDir, '.anvil'), { recursive: true })
    writeFileSync(join(tmpDir, '.anvil', 'session.json'), 'NOT_VALID_JSON{{{')

    const { progressCommand } = await import(
      '../../../../src/commands/cli/progress.js'
    )
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    // Should not throw
    await expect(progressCommand({})).resolves.toBeUndefined()
    writeSpy.mockRestore()

    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(allOutput).not.toMatch(/Session cost/)
  })
})
