import { describe, expect, it } from 'vitest'
import {
  ARTIFACT_TOKENS,
  findArtifactTokens,
  isArtifactToken,
  resolveArtifactPath,
  substituteArtifactTokens,
} from '../../../src/core/artifact-paths.js'

describe('artifact-path resolver', () => {
  const projectRoot = '/repo'
  const anvilRoot = '/anvil-bundle'
  const userRoot = '/home/user'

  describe('isArtifactToken', () => {
    it('accepts every declared token', () => {
      for (const tok of ARTIFACT_TOKENS) {
        expect(isArtifactToken(tok)).toBe(true)
      }
    })

    it('rejects unknown tokens', () => {
      expect(isArtifactToken('CLAUDE_SKILL_DIR')).toBe(false)
      expect(isArtifactToken('ANVIL_PLAN_DIR')).toBe(false) // typo
      expect(isArtifactToken('SLUG')).toBe(false)
    })
  })

  describe('resolveArtifactPath — scope: project', () => {
    const ctx = { anvilRoot, projectRoot, scope: 'project' as const }

    it('resolves ANVIL_PLANS_DIR under projectRoot', () => {
      expect(resolveArtifactPath('ANVIL_PLANS_DIR', ctx)).toBe(
        '/repo/.anvil/plans',
      )
    })

    it('resolves ANVIL_BACKGROUND_RESULTS as a file path', () => {
      expect(resolveArtifactPath('ANVIL_BACKGROUND_RESULTS', ctx)).toBe(
        '/repo/.anvil/background-results.md',
      )
    })

    it('resolves docs/anvil/-style tokens under projectRoot', () => {
      expect(resolveArtifactPath('ANVIL_RELEASES_DIR', ctx)).toBe(
        '/repo/docs/anvil/releases',
      )
      expect(resolveArtifactPath('BACKLOG_FILE', ctx)).toBe(
        '/repo/docs/anvil/backlog.md',
      )
      expect(resolveArtifactPath('ROADMAP_FILE', ctx)).toBe(
        '/repo/docs/roadmap.md',
      )
    })

    it('throws on unknown tokens', () => {
      expect(() => resolveArtifactPath('NOT_A_TOKEN', ctx)).toThrow(
        /Unknown artefact token/,
      )
    })
  })

  describe('resolveArtifactPath — scope: user', () => {
    const ctx = {
      anvilRoot,
      projectRoot,
      userRoot,
      scope: 'user' as const,
    }

    it('resolves under userRoot when provided', () => {
      expect(resolveArtifactPath('ANVIL_PLANS_DIR', ctx)).toBe(
        '/home/user/.anvil/plans',
      )
    })

    it('falls back to projectRoot when userRoot is omitted', () => {
      const fallback = {
        anvilRoot,
        projectRoot,
        scope: 'user' as const,
      }
      expect(resolveArtifactPath('ANVIL_TICKETS_DIR', fallback)).toBe(
        '/repo/.anvil/tickets',
      )
    })
  })

  describe('resolveArtifactPath — scope: bundled', () => {
    const ctx = { anvilRoot, projectRoot, scope: 'bundled' as const }

    it('resolves under anvilRoot', () => {
      expect(resolveArtifactPath('ANVIL_SPECS_DIR', ctx)).toBe(
        '/anvil-bundle/.anvil/specs',
      )
      expect(resolveArtifactPath('ANVIL_FEATURES_DIR', ctx)).toBe(
        '/anvil-bundle/.anvil/specs/features',
      )
    })
  })

  describe('substituteArtifactTokens', () => {
    const ctx = {
      anvilRoot,
      projectRoot,
      scope: 'project' as const,
    }

    it('rewrites every known token in a body', () => {
      const body =
        'Save plans to ${ANVIL_PLANS_DIR}/foo.md and audits to ${ANVIL_AUDITS_DIR}/.'
      const out = substituteArtifactTokens(body, ctx)
      expect(out).toBe(
        'Save plans to /repo/.anvil/plans/foo.md and audits to /repo/.anvil/audits/.',
      )
    })

    it('leaves unknown ${TOKEN} references untouched', () => {
      // Unknown tokens (e.g. ${SLUG}, ${CLAUDE_SKILL_DIR}) pass through —
      // they may be used by other substitution mechanisms or be literal prose.
      const body = '${SLUG} and ${ANVIL_PLANS_DIR} and ${CLAUDE_SKILL_DIR}.'
      const out = substituteArtifactTokens(body, ctx)
      expect(out).toBe(
        '${SLUG} and /repo/.anvil/plans and ${CLAUDE_SKILL_DIR}.',
      )
    })

    it('returns the body unchanged when no tokens are present', () => {
      const body = 'plain prose with no placeholders.'
      expect(substituteArtifactTokens(body, ctx)).toBe(body)
    })

    it('respects the scope when substituting', () => {
      const body = 'spec lives under ${ANVIL_SPECS_DIR}'
      expect(
        substituteArtifactTokens(body, {
          anvilRoot,
          projectRoot,
          scope: 'bundled',
        }),
      ).toBe('spec lives under /anvil-bundle/.anvil/specs')
    })
  })

  describe('findArtifactTokens', () => {
    it('returns every distinct artefact token referenced in a body', () => {
      const body =
        'See ${ANVIL_PLANS_DIR}/x.md and ${ANVIL_AUDITS_DIR}/ and ${ANVIL_PLANS_DIR}/y.md.'
      const found = findArtifactTokens(body)
      expect(found.sort()).toEqual(['ANVIL_AUDITS_DIR', 'ANVIL_PLANS_DIR'])
    })

    it('skips unknown ${TOKEN} references', () => {
      const body = 'mix of ${SLUG} and ${ANVIL_TICKETS_DIR} here.'
      expect(findArtifactTokens(body)).toEqual(['ANVIL_TICKETS_DIR'])
    })

    it('returns an empty list when no artefact tokens are present', () => {
      expect(findArtifactTokens('plain prose')).toEqual([])
    })
  })
})
