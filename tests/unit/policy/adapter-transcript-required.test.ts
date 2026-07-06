/**
 * Policy lint: adapter-transcript-required (ANV-0101)
 *
 * Simulates a "PR diff" (list of changed file paths) and asserts that any
 * change to src/adapters/ or src/opencode-plugin/ without a corresponding
 * transcripts/<date>-<adapter>.json artifact is flagged.
 *
 * This test exercises the CI lint script at
 * scripts/audit/adapter-transcript-lint.ts, which is the enforcement mechanism
 * for docs/adapter-transcript-policy.md.
 * Motivating defects: W-001 (missing bootstrap), W-002 (hook-map drift).
 */

import { describe, expect, it } from 'vitest'
import {
  checkAdapterTranscriptPolicy,
  hasTranscript,
  touchesAdapter,
} from '../../../scripts/audit/adapter-transcript-lint.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('adapter-transcript-required policy', () => {
  describe('touchesAdapter()', () => {
    it('returns false when no adapter paths are changed', () => {
      expect(
        touchesAdapter(['src/core/types.ts', 'tests/unit/core/types.test.ts']),
      ).toBe(false)
    })

    it('returns true for src/adapters/ changes', () => {
      expect(touchesAdapter(['src/adapters/claude-code/adapter.ts'])).toBe(true)
    })

    it('returns true for src/opencode-plugin/ changes', () => {
      expect(touchesAdapter(['src/opencode-plugin/index.ts'])).toBe(true)
    })

    it('returns true for nested adapter paths', () => {
      expect(touchesAdapter(['src/adapters/opencode/generate.ts'])).toBe(true)
    })

    it('returns true when adapter change is mixed with other paths', () => {
      expect(
        touchesAdapter([
          'docs/adapter-transcript-policy.md',
          'src/adapters/claude-code/generate.ts',
        ]),
      ).toBe(true)
    })
  })

  describe('hasTranscript()', () => {
    it('returns false when no transcript files are present', () => {
      expect(
        hasTranscript(['src/adapters/claude-code/adapter.ts', 'docs/foo.md']),
      ).toBe(false)
    })

    it('returns true for a minimal transcript filename', () => {
      expect(hasTranscript(['transcripts/2026-05-08-claude-code.json'])).toBe(
        true,
      )
    })

    it('returns true for a transcript with a label suffix (.example)', () => {
      expect(
        hasTranscript(['transcripts/2026-05-08-claude-code.example.json']),
      ).toBe(true)
    })

    it('returns true for an opencode transcript', () => {
      expect(hasTranscript(['transcripts/2026-05-08-opencode.json'])).toBe(true)
    })

    it('rejects paths outside transcripts/', () => {
      expect(
        hasTranscript(['docs/transcripts/2026-05-08-claude-code.json']),
      ).toBe(false)
    })

    it('rejects transcript paths without a date prefix', () => {
      expect(hasTranscript(['transcripts/claude-code.json'])).toBe(false)
    })
  })

  describe('checkAdapterTranscriptPolicy()', () => {
    // --- PASS cases ---

    it('passes when no adapter files are changed', () => {
      const result = checkAdapterTranscriptPolicy([
        'src/core/types.ts',
        'tests/unit/core/types.test.ts',
        'docs/skill-authoring.md',
      ])
      expect(result.pass).toBe(true)
    })

    it('passes when adapter is changed AND transcript is present', () => {
      const result = checkAdapterTranscriptPolicy([
        'src/adapters/claude-code/generate.ts',
        'transcripts/2026-05-08-claude-code.json',
      ])
      expect(result.pass).toBe(true)
    })

    it('passes when opencode-plugin is changed AND transcript is present', () => {
      const result = checkAdapterTranscriptPolicy([
        'src/opencode-plugin/hooks/map.ts',
        'transcripts/2026-05-08-opencode.json',
      ])
      expect(result.pass).toBe(true)
    })

    it('passes with labelled exemplar transcript', () => {
      const result = checkAdapterTranscriptPolicy([
        'src/adapters/claude-code/adapter.ts',
        'transcripts/2026-05-08-claude-code.example.json',
      ])
      expect(result.pass).toBe(true)
    })

    // --- FAIL cases (W-001 / W-002 scenarios) ---

    it('fails when adapter is changed with NO transcript — W-001 scenario', () => {
      // W-001: opencode-plugin/index.ts modified (bootstrap path), no transcript.
      const result = checkAdapterTranscriptPolicy([
        'src/opencode-plugin/index.ts',
        'tests/unit/adapters/opencode/generate.test.ts',
      ])
      expect(result.pass).toBe(false)
      if (!result.pass) {
        expect(result.reason).toContain('W-001')
        expect(result.reason).toContain('docs/adapter-transcript-policy.md')
      }
    })

    it('fails when adapter hook map is changed with NO transcript — W-002 scenario', () => {
      // W-002: opencode-plugin/hooks/map.ts modified (hook drift), no transcript.
      const result = checkAdapterTranscriptPolicy([
        'src/opencode-plugin/hooks/map.ts',
        'src/core/manifest-schema/opencode.ts',
      ])
      expect(result.pass).toBe(false)
      if (!result.pass) {
        expect(result.reason).toContain('W-002')
      }
    })

    it('fails for src/adapters/ change with no transcript', () => {
      const result = checkAdapterTranscriptPolicy([
        'src/adapters/claude-code/generate.ts',
      ])
      expect(result.pass).toBe(false)
    })

    it('fails when transcript is present but at wrong path', () => {
      const result = checkAdapterTranscriptPolicy([
        'src/adapters/claude-code/generate.ts',
        'docs/transcripts/2026-05-08-claude-code.json', // wrong location
      ])
      expect(result.pass).toBe(false)
    })

    it('reason string cites the policy doc', () => {
      const result = checkAdapterTranscriptPolicy([
        'src/adapters/opencode/adapter.ts',
      ])
      expect(result.pass).toBe(false)
      if (!result.pass) {
        expect(result.reason).toContain('docs/adapter-transcript-policy.md')
        expect(result.reason).toContain('ANV-0101')
      }
    })
  })
})
