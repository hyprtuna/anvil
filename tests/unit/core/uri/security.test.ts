import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseGrammar } from '../../../../src/core/uri/grammar.js'
import { resolveAnvilUri } from '../../../../src/core/uri/resolve.js'
import type { ResolveRoots } from '../../../../src/core/uri/types.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

let tmp: string
let roots: ResolveRoots

beforeEach(() => {
  tmp = createTestTmpDir('anvil-uri-security')
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

describe('core/uri/security — path-traversal hardening', () => {
  it('rejects percent-encoded traversal — resolver does not decode', () => {
    // Per RFC §8.1: %2F traversal must stay MALFORMED (no decoding).
    const parsed = parseGrammar('anvil:skill/..%2Fetc%2Fpasswd')
    expect(parsed).toBeNull()
    const r = resolveAnvilUri('anvil:skill/..%2Fetc%2Fpasswd', { roots })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('MALFORMED')
  })

  it('rejects pack name containing ".." at grammar level', () => {
    expect(parseGrammar('anvil:..:skill/x')).toBeNull()
    expect(parseGrammar('anvil:foo..bar:skill/x')).toBeNull()
  })

  it('rejects symlink that escapes the pack root via realpath', () => {
    // Set up an "escape hatch" outside the packs root.
    const outside = join(tmp, 'outside')
    mkdirSync(outside, { recursive: true })
    const escapeTarget = join(outside, 'SKILL.md')
    writeFileSync(escapeTarget, 'pwned')

    // Build the pack skill dir; the SKILL.md file is a symlink to /outside.
    const packSkillDir = join(
      roots.packsRoot,
      'evil',
      'skills',
      'universal',
      'pwn',
    )
    mkdirSync(packSkillDir, { recursive: true })
    symlinkSync(escapeTarget, join(packSkillDir, 'SKILL.md'))

    const r = resolveAnvilUri('anvil:evil:skill/pwn', { roots })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('PATH_TRAVERSAL')
  })

  it('property: every successful resolution lives under an allowed root', () => {
    // Create a handful of fixtures across roots and ensure fsPath is always
    // a child of one of the configured roots.
    writeFileSync(
      makeDir(join(roots.bundledRoot, 'skills', 'universal', 'a'), 'SKILL.md'),
      '',
    )
    writeFileSync(makeDir(join(roots.bundledRoot, 'agents'), 'b.md'), '')
    writeFileSync(
      makeDir(join(roots.projectRoot, '.anvil', 'plans'), 'v1.2.3.plan.md'),
      '',
    )

    const allRoots = Object.values(roots)
    const uris = ['anvil:skill/a', 'anvil:agent/b', 'anvil:plan/v1.2.3']
    for (const uri of uris) {
      const r = resolveAnvilUri(uri, { roots })
      expect(r.ok, uri).toBe(true)
      if (r.ok) {
        const inside = allRoots.some((root) => r.ref.fsPath.startsWith(root))
        expect(
          inside,
          `${r.ref.fsPath} must be under one of ${allRoots.join(', ')}`,
        ).toBe(true)
      }
    }
  })

  it('uppercase or path-separator characters in slug are rejected at grammar', () => {
    expect(parseGrammar('anvil:skill/Foo')).toBeNull()
    expect(parseGrammar('anvil:skill/foo/bar')).toBeNull()
    expect(parseGrammar('anvil:skill/foo bar')).toBeNull()
  })
})

function makeDir(dir: string, file: string): string {
  mkdirSync(dir, { recursive: true })
  return join(dir, file)
}
