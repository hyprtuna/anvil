import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ResolverContext } from '../../../../src/experimental/extensions/cli/collision-resolver.js'
import { resolveCollision } from '../../../../src/experimental/extensions/cli/collision-resolver.js'
import type { CollisionFinding } from '../../../../src/installer/extensions/install-pipeline.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tier1Collision(slug = 'my-ext'): CollisionFinding {
  return {
    tier: 1,
    kind: 'extension',
    slug,
    conflictingSource: `installed extension '${slug}'`,
  }
}

function tier2Collision(slug = 'some-skill'): CollisionFinding {
  return {
    tier: 2,
    kind: 'skill',
    slug,
    conflictingSource: `bundled skill '${slug}'`,
  }
}

function tier3Collision(slug = 'shared-agent'): CollisionFinding {
  return {
    tier: 3,
    kind: 'agent',
    slug,
    conflictingSource: `extension 'other-ext' also provides agent '${slug}'`,
  }
}

function baseCtx(overrides: Partial<ResolverContext> = {}): ResolverContext {
  return {
    manifestName: 'my-ext',
    manifestVersion: '1.0.0',
    collisions: [tier1Collision()],
    isHostClaude: false,
    isTTY: false,
    ...overrides,
  }
}

// ─── No-channel path ──────────────────────────────────────────────────────────

describe('resolveCollision — no-channel', () => {
  it('returns no-channel when not host and not TTY', async () => {
    const result = await resolveCollision(
      baseCtx({ isHostClaude: false, isTTY: false }),
    )
    expect(result.kind).toBe('no-channel')
    expect((result as { kind: 'no-channel'; detail: string }).detail).toMatch(
      /--on-collision/,
    )
  })
})

// ─── Host-prompt-emitted path ─────────────────────────────────────────────────

describe('resolveCollision — host-prompt-emitted (ANVIL_HOST=claude-code)', () => {
  let stdoutLines: string[]
  let origWrite: typeof process.stdout.write

  beforeEach(() => {
    stdoutLines = []
    origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = (chunk: unknown) => {
      stdoutLines.push(String(chunk))
      return true
    }
  })

  afterEach(() => {
    process.stdout.write = origWrite
  })

  it('emits ANVIL_DECISION: line when isHostClaude=true', async () => {
    const result = await resolveCollision(baseCtx({ isHostClaude: true }))
    expect(result.kind).toBe('host-prompt-emitted')
    const allOutput = stdoutLines.join('')
    const decisionLine = allOutput
      .split('\n')
      .find((l) => l.startsWith('ANVIL_DECISION:'))
    expect(decisionLine).toBeDefined()
  })

  it('ANVIL_DECISION: line contains valid JSON with AskUserQuestion shape', async () => {
    await resolveCollision(baseCtx({ isHostClaude: true }))
    const allOutput = stdoutLines.join('')
    const decisionLine = allOutput
      .split('\n')
      .find((l) => l.startsWith('ANVIL_DECISION:'))!
    const jsonPart = decisionLine.slice('ANVIL_DECISION:'.length).trim()
    const parsed = JSON.parse(jsonPart) as Record<string, unknown>
    // AskUserQuestion shape: question, intro, options[]
    expect(typeof parsed.question).toBe('string')
    expect(typeof parsed.intro).toBe('string')
    expect(Array.isArray(parsed.options)).toBe(true)
    const options = parsed.options as Array<{
      label: string
      description: string
    }>
    expect(options.length).toBe(4)
    const labels = options.map((o) => o.label)
    // Labels must cover Replace, Rename, Skip, Abort (may have ' (Recommended)' appended)
    expect(labels.some((l) => l.includes('Replace'))).toBe(true)
    expect(labels.some((l) => l.includes('Rename'))).toBe(true)
    expect(labels.some((l) => l.includes('Skip'))).toBe(true)
    expect(labels.some((l) => l.includes('Abort'))).toBe(true)
  })

  it('four options always present regardless of tier mix', async () => {
    await resolveCollision(
      baseCtx({ isHostClaude: true, collisions: [tier2Collision()] }),
    )
    const allOutput = stdoutLines.join('')
    const line = allOutput
      .split('\n')
      .find((l) => l.startsWith('ANVIL_DECISION:'))!
    const parsed = JSON.parse(line.slice('ANVIL_DECISION:'.length).trim()) as {
      options: unknown[]
    }
    expect(parsed.options.length).toBe(4)
  })
})

// ─── Recommendation logic ─────────────────────────────────────────────────────

describe('resolveCollision — recommendation logic (host mode)', () => {
  let stdoutLines: string[]
  let origWrite: typeof process.stdout.write

  beforeEach(() => {
    stdoutLines = []
    origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = (chunk: unknown) => {
      stdoutLines.push(String(chunk))
      return true
    }
  })

  afterEach(() => {
    process.stdout.write = origWrite
  })

  function getPayload(): {
    question: string
    intro: string
    options: Array<{ label: string; description: string }>
    _rationale?: string
  } {
    const allOutput = stdoutLines.join('')
    const line = allOutput
      .split('\n')
      .find((l) => l.startsWith('ANVIL_DECISION:'))!
    return JSON.parse(
      line.slice('ANVIL_DECISION:'.length).trim(),
    ) as ReturnType<typeof getPayload>
  }

  it('recommends Replace with medium confidence when all collisions are Tier 1', async () => {
    await resolveCollision(
      baseCtx({
        isHostClaude: true,
        collisions: [tier1Collision()],
      }),
    )
    const payload = getPayload()
    const replaceOpt = payload.options.find((o) => o.label.includes('Replace'))!
    expect(replaceOpt.label).toContain('Recommended')
    const abortOpt = payload.options.find((o) => o.label.includes('Abort'))!
    expect(abortOpt.label).not.toContain('Recommended')
  })

  it('recommends Abort with high confidence when any Tier 2 collision', async () => {
    await resolveCollision(
      baseCtx({
        isHostClaude: true,
        collisions: [tier1Collision(), tier2Collision()],
      }),
    )
    const payload = getPayload()
    const abortOpt = payload.options.find((o) => o.label.includes('Abort'))!
    expect(abortOpt.label).toContain('Recommended')
    const replaceOpt = payload.options.find((o) => o.label.includes('Replace'))!
    expect(replaceOpt.label).not.toContain('Recommended')
  })

  it('recommends Abort with low confidence for Tier 3 only', async () => {
    await resolveCollision(
      baseCtx({
        isHostClaude: true,
        collisions: [tier3Collision()],
      }),
    )
    const payload = getPayload()
    const abortOpt = payload.options.find((o) => o.label.includes('Abort'))!
    expect(abortOpt.label).toContain('Recommended')
  })

  it('mixed Tier1+Tier2: Abort is recommended', async () => {
    await resolveCollision(
      baseCtx({
        isHostClaude: true,
        collisions: [tier1Collision(), tier2Collision(), tier3Collision()],
      }),
    )
    const payload = getPayload()
    const abortOpt = payload.options.find((o) => o.label.includes('Abort'))!
    expect(abortOpt.label).toContain('Recommended')
  })
})

// ─── TTY stdin fallback ───────────────────────────────────────────────────────

describe('resolveCollision — TTY stdin fallback', () => {
  /**
   * We inject a readable stream as mock stdin and resolve with a specific key.
   * The resolver module accepts an optional stdinOverride parameter for testing.
   */

  it('key "3" → strategy: skip', async () => {
    // For TTY path, we need to override stdin reading.
    // The resolver accepts an optional stdinProvider for testability.
    const { resolveCollisionWithStdin } = await import(
      '../../../../src/experimental/extensions/cli/collision-resolver.js'
    )
    const result = await resolveCollisionWithStdin(
      baseCtx({ isTTY: true }),
      async () => '3\n',
    )
    expect(result.kind).toBe('strategy')
    expect((result as { kind: 'strategy'; strategy: string }).strategy).toBe(
      'skip',
    )
  })

  it('key "1" → strategy: replace', async () => {
    const { resolveCollisionWithStdin } = await import(
      '../../../../src/experimental/extensions/cli/collision-resolver.js'
    )
    const result = await resolveCollisionWithStdin(
      baseCtx({ isTTY: true }),
      async () => '1\n',
    )
    expect(result.kind).toBe('strategy')
    expect((result as { kind: 'strategy'; strategy: string }).strategy).toBe(
      'replace',
    )
  })

  it('key "4" → strategy: abort', async () => {
    const { resolveCollisionWithStdin } = await import(
      '../../../../src/experimental/extensions/cli/collision-resolver.js'
    )
    const result = await resolveCollisionWithStdin(
      baseCtx({ isTTY: true }),
      async () => '4\n',
    )
    expect(result.kind).toBe('strategy')
    expect((result as { kind: 'strategy'; strategy: string }).strategy).toBe(
      'abort',
    )
  })

  it('key "2" then rename slug → strategy: rename with rename value', async () => {
    const { resolveCollisionWithStdin } = await import(
      '../../../../src/experimental/extensions/cli/collision-resolver.js'
    )
    let callCount = 0
    const stdinProvider = async () => {
      callCount++
      if (callCount === 1) return '2\n'
      return 'my-new-name\n'
    }
    const result = await resolveCollisionWithStdin(
      baseCtx({ isTTY: true }),
      stdinProvider,
    )
    expect(result.kind).toBe('strategy')
    expect(
      (result as { kind: 'strategy'; strategy: string; rename?: string })
        .strategy,
    ).toBe('rename')
    expect(
      (result as { kind: 'strategy'; strategy: string; rename?: string })
        .rename,
    ).toBe('my-new-name')
  })
})
