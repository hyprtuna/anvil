import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  EMBEDDED_TEMPLATE_MARKER,
  bodyContainsEmbeddedTemplateMarker,
  findTemplateRefs,
  listUserTemplateOverrides,
  resolveTemplate,
  substituteTemplateRefs,
} from '../../../src/core/templates/index.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

describe('templates resolver', () => {
  let tmp: string
  let anvilRoot: string
  let userRoot: string

  beforeEach(() => {
    tmp = createTestTmpDir('anvil-templates')
    anvilRoot = join(tmp, 'bundle')
    userRoot = join(tmp, 'user-home', '.anvil')
    mkdirSync(join(anvilRoot, 'templates', 'decisions'), { recursive: true })
    mkdirSync(join(anvilRoot, 'templates', 'plans'), { recursive: true })
    writeFileSync(
      join(anvilRoot, 'templates', 'decisions', 'default.md'),
      'BUNDLED decisions/default',
    )
    writeFileSync(
      join(anvilRoot, 'templates', 'decisions', 'claude-code.json'),
      '{"variant":"cc"}',
    )
    writeFileSync(
      join(anvilRoot, 'templates', 'plans', 'default.md'),
      'BUNDLED plans/default',
    )
  })

  describe('resolveTemplate', () => {
    it('returns bundled default when no user override is present', () => {
      const r = resolveTemplate('decisions', { anvilRoot })
      expect(r?.tier).toBe('bundled')
      expect(r?.variant).toBe('default.md')
      expect(r?.content).toBe('BUNDLED decisions/default')
    })

    it('returns undefined for unknown kinds (lenient policy)', () => {
      expect(resolveTemplate('nonexistent', { anvilRoot })).toBeUndefined()
    })

    it('prefers the user-override when both bundled and user exist', () => {
      mkdirSync(join(userRoot, 'templates', 'decisions'), { recursive: true })
      writeFileSync(
        join(userRoot, 'templates', 'decisions', 'default.md'),
        'USER decisions/default',
      )
      const r = resolveTemplate('decisions', { anvilRoot, userRoot })
      expect(r?.tier).toBe('user')
      expect(r?.content).toBe('USER decisions/default')
    })

    it('prefers a surface-specific variant when surface is supplied', () => {
      const r = resolveTemplate('decisions', {
        anvilRoot,
        surface: 'claude-code',
      })
      expect(r?.variant).toBe('claude-code.json')
      expect(r?.content).toBe('{"variant":"cc"}')
    })

    it('falls back to default.md when no surface-specific variant exists', () => {
      // Plans only has default.md
      const r = resolveTemplate('plans', { anvilRoot, surface: 'opencode' })
      expect(r?.variant).toBe('default.md')
      expect(r?.content).toBe('BUNDLED plans/default')
    })

    it('returns undefined when no roots are supplied', () => {
      expect(resolveTemplate('decisions', {})).toBeUndefined()
    })
  })

  describe('substituteTemplateRefs', () => {
    it('replaces a single reference with the resolved content', () => {
      const body = 'Header\n\n${TEMPLATE:decisions}\n\nFooter'
      const out = substituteTemplateRefs(body, { anvilRoot })
      expect(out).toBe('Header\n\nBUNDLED decisions/default\n\nFooter')
    })

    it('leaves unknown kinds verbatim (lenient)', () => {
      const body = 'a\n${TEMPLATE:nonexistent}\nb'
      expect(substituteTemplateRefs(body, { anvilRoot })).toBe(body)
    })

    it('ignores non-template ${...} expressions', () => {
      const body = '${ANVIL_PLANS_DIR} stays untouched'
      expect(substituteTemplateRefs(body, { anvilRoot })).toBe(body)
    })

    it('replaces multiple references in one pass', () => {
      const body = '${TEMPLATE:decisions} | ${TEMPLATE:plans}'
      expect(substituteTemplateRefs(body, { anvilRoot })).toBe(
        'BUNDLED decisions/default | BUNDLED plans/default',
      )
    })
  })

  describe('findTemplateRefs', () => {
    it('returns the distinct kinds referenced in a body', () => {
      const body = 'x ${TEMPLATE:a} y ${TEMPLATE:b} z ${TEMPLATE:a}'
      expect(findTemplateRefs(body).sort()).toEqual(['a', 'b'])
    })

    it('returns [] when no refs exist', () => {
      expect(findTemplateRefs('plain markdown body')).toEqual([])
    })
  })

  describe('listUserTemplateOverrides', () => {
    it('returns [] when userRoot has no templates/ directory', () => {
      expect(listUserTemplateOverrides(userRoot)).toEqual([])
    })

    it('lists every (kind, variant) pair found', () => {
      mkdirSync(join(userRoot, 'templates', 'decisions'), { recursive: true })
      mkdirSync(join(userRoot, 'templates', 'plans'), { recursive: true })
      writeFileSync(join(userRoot, 'templates', 'decisions', 'default.md'), '')
      writeFileSync(join(userRoot, 'templates', 'decisions', 'opencode.md'), '')
      writeFileSync(join(userRoot, 'templates', 'plans', 'default.md'), '')
      const overrides = listUserTemplateOverrides(userRoot)
      expect(overrides).toContainEqual({
        kind: 'decisions',
        variant: 'default.md',
      })
      expect(overrides).toContainEqual({
        kind: 'decisions',
        variant: 'opencode.md',
      })
      expect(overrides).toContainEqual({ kind: 'plans', variant: 'default.md' })
      expect(overrides).toHaveLength(3)
    })
  })

  describe('embedded-template marker detection', () => {
    it('matches the explicit HTML-comment marker', () => {
      expect(
        bodyContainsEmbeddedTemplateMarker(
          `pre\n${EMBEDDED_TEMPLATE_MARKER}\npost`,
        ),
      ).toBe(true)
    })

    it('returns false for unrelated comments', () => {
      expect(
        bodyContainsEmbeddedTemplateMarker('<!-- some-other-marker -->'),
      ).toBe(false)
    })
  })
})
