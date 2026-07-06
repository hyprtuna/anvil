import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveAnvilUri } from '../../../../src/core/uri/resolve.js'
import type { ResolveRoots } from '../../../../src/core/uri/types.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

let tmp: string
let roots: ResolveRoots

beforeEach(() => {
  tmp = createTestTmpDir('anvil-uri-resolve')
  roots = {
    projectRoot: join(tmp, 'project'),
    homeRoot: join(tmp, 'home'),
    bundledRoot: join(tmp, 'bundled'),
    packsRoot: join(tmp, 'packs'),
  }
  for (const r of Object.values(roots)) mkdirSync(r, { recursive: true })
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

function write(path: string, content = 'x'): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

describe('core/uri/resolve — resolveAnvilUri', () => {
  it('resolves all 7 kinds against tmp-dir roots', () => {
    write(
      join(roots.bundledRoot, 'skills', 'universal', 'code-review', 'SKILL.md'),
    )
    write(join(roots.bundledRoot, 'agents', 'code-architect.md'))
    write(
      join(roots.bundledRoot, 'src', 'hooks', 'handlers', 'session-start.ts'),
    )
    write(join(roots.bundledRoot, 'src', 'commands', 'cli', 'init.ts'))
    write(join(roots.bundledRoot, 'src', 'commands', 'slash', 'skill-run.md'))
    write(join(roots.projectRoot, '.anvil', 'plans', 'v0.15.6.plan.md'))
    write(join(roots.projectRoot, '.anvil', 'tickets', 'ANV-0095-anvil-uri.md'))

    const cases: Array<[string, string]> = [
      [
        'anvil:skill/code-review',
        join(
          roots.bundledRoot,
          'skills',
          'universal',
          'code-review',
          'SKILL.md',
        ),
      ],
      [
        'anvil:agent/code-architect',
        join(roots.bundledRoot, 'agents', 'code-architect.md'),
      ],
      [
        'anvil:hook/session-start',
        join(roots.bundledRoot, 'src', 'hooks', 'handlers', 'session-start.ts'),
      ],
      [
        'anvil:command/init',
        join(roots.bundledRoot, 'src', 'commands', 'cli', 'init.ts'),
      ],
      [
        'anvil:slash/skill-run',
        join(roots.bundledRoot, 'src', 'commands', 'slash', 'skill-run.md'),
      ],
      [
        'anvil:plan/v0.15.6',
        join(roots.projectRoot, '.anvil', 'plans', 'v0.15.6.plan.md'),
      ],
      [
        'anvil:ticket/ANV-0095',
        join(roots.projectRoot, '.anvil', 'tickets', 'ANV-0095-anvil-uri.md'),
      ],
    ]
    for (const [uri, fsPath] of cases) {
      const r = resolveAnvilUri(uri, { roots })
      expect(r.ok, `resolve ${uri}: ${r.ok ? 'ok' : r.error.message}`).toBe(
        true,
      )
      if (r.ok) expect(r.ref.fsPath).toBe(fsPath)
    }
  })

  it('returns NOT_FOUND for well-formed-but-missing URI', () => {
    const r = resolveAnvilUri('anvil:skill/nope-never', { roots })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND')
  })

  it('returns AMBIGUOUS_KIND for shorthand without inferredKind', () => {
    const r = resolveAnvilUri('anvil:code-review', { roots })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('AMBIGUOUS_KIND')
  })

  it('shorthand + inferredKind resolves identically to canonical form', () => {
    write(
      join(roots.bundledRoot, 'skills', 'universal', 'code-review', 'SKILL.md'),
    )

    const canonical = resolveAnvilUri('anvil:skill/code-review', { roots })
    const shorthand = resolveAnvilUri('anvil:code-review', {
      roots,
      inferredKind: 'skill',
    })
    expect(canonical.ok && shorthand.ok).toBe(true)
    if (canonical.ok && shorthand.ok) {
      expect(shorthand.ref.fsPath).toBe(canonical.ref.fsPath)
      expect(shorthand.ref.kind).toBe('skill')
      // Canonical URI string is the same (canonicalise normalises both).
      expect(shorthand.ref.uri).toBe(canonical.ref.uri)
    }
  })

  it('plan kind prefers .plan.md over releases/ when both exist', () => {
    write(
      join(roots.projectRoot, '.anvil', 'plans', 'v0.15.6.plan.md'),
      'in-flight',
    )
    write(
      join(roots.projectRoot, 'docs', 'anvil', 'releases', 'v0.15.6.md'),
      'released',
    )
    const r = resolveAnvilUri('anvil:plan/v0.15.6', { roots })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.ref.fsPath.endsWith('plans/v0.15.6.plan.md')).toBe(true)
  })

  it('plan kind falls back to releases/ when .plan.md is absent', () => {
    write(
      join(roots.projectRoot, 'docs', 'anvil', 'releases', 'v0.15.6.md'),
      'released',
    )
    const r = resolveAnvilUri('anvil:plan/v0.15.6', { roots })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.ref.fsPath.endsWith('releases/v0.15.6.md')).toBe(true)
  })

  it('returns NOT_ANVIL_URI for non-anvil scheme', () => {
    const r = resolveAnvilUri('https://example.com', { roots })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('NOT_ANVIL_URI')
  })

  it('returns MALFORMED for grammar failures', () => {
    const r = resolveAnvilUri('anvil:Skill/x', { roots })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('MALFORMED')
  })

  it('errors are returned, never thrown', () => {
    // Sanity: no fixtures, various bad inputs — all return cleanly.
    for (const uri of ['', 'anvil:', 'anvil:bogus/x', 'anvil:skill/']) {
      expect(() => resolveAnvilUri(uri, { roots })).not.toThrow()
      const r = resolveAnvilUri(uri, { roots })
      expect(r.ok).toBe(false)
    }
  })

  it('resolves pack-qualified skill under packsRoot', () => {
    write(
      join(
        roots.packsRoot,
        'myteam',
        'skills',
        'universal',
        'code-review',
        'SKILL.md',
      ),
    )
    const r = resolveAnvilUri('anvil:myteam:skill/code-review', { roots })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.ref.pack).toBe('myteam')
      expect(r.ref.fsPath.startsWith(roots.packsRoot)).toBe(true)
    }
  })

  it('preserves fragment in canonicalised URI', () => {
    write(
      join(roots.bundledRoot, 'skills', 'universal', 'code-review', 'SKILL.md'),
    )
    const r = resolveAnvilUri('anvil:skill/code-review#step-3', { roots })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.ref.fragment).toBe('step-3')
      expect(r.ref.uri).toBe('anvil:skill/code-review#step-3')
    }
  })
})
