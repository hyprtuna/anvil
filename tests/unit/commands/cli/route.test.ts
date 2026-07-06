import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { routeCommand } from '../../../../src/commands/cli/route.js'

// Capture stdout writes
function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const orig = process.stdout.write.bind(process.stdout)
  const spy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: string | Uint8Array) => {
      lines.push(
        typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(),
      )
      return true
    })
  return {
    lines,
    restore: () => {
      spy.mockRestore()
      void orig
    },
  }
}

describe('commands/cli/route', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(
        (_code?: string | number | null | undefined): never => {
          throw new Error(`process.exit(${_code})`)
        },
      )
  })

  afterEach(() => {
    exitSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('happy path: returns exit 0 and prints a banner for a recognizable prompt', async () => {
    const cap = captureStdout()
    try {
      await routeCommand('plan an OAuth feature', { color: false })
    } finally {
      cap.restore()
    }
    const out = cap.lines.join('')
    // Should have printed something (banner or intent section)
    expect(out.length).toBeGreaterThan(0)
    // Should mention the intent (plan) or related terms
    expect(out).toMatch(/plan|intent|skill/i)
  })

  it('happy path: top intent matches expectation for "debug" prompt', async () => {
    const cap = captureStdout()
    try {
      await routeCommand('debug this null pointer exception', { color: false })
    } finally {
      cap.restore()
    }
    const out = cap.lines.join('')
    expect(out).toMatch(/debug/i)
  })

  it('--json: emits parseable JSON with recommendedSkills/recommendedAgents keys', async () => {
    const cap = captureStdout()
    try {
      await routeCommand('fix this bug', { json: true, color: false })
    } finally {
      cap.restore()
    }
    const out = cap.lines.join('')
    const parsed = JSON.parse(out) as Record<string, unknown>
    // RoutingDecision shape: skills + agent
    expect(Array.isArray(parsed.skills)).toBe(true)
    expect(typeof parsed.agent).toBe('string')
    expect(typeof parsed.intent).toBe('string')
    expect(typeof parsed.confidence).toBe('number')
  })

  it('empty prompt: prints usage and exits with code 2', async () => {
    await expect(routeCommand('', {})).rejects.toThrow('process.exit(2)')
    expect(exitSpy).toHaveBeenCalledWith(2)
  })

  it('whitespace-only prompt: exits with code 2', async () => {
    await expect(routeCommand('   ', {})).rejects.toThrow('process.exit(2)')
    expect(exitSpy).toHaveBeenCalledWith(2)
  })
})
