import { describe, expect, it } from 'vitest'
import {
  ReviewFinding,
  ReviewPass,
  ReviewReport,
} from '../../../src/core/types.js'

describe('ReviewReport Zod schema', () => {
  const validFindingSpec = {
    review_type: 'spec-compliance' as const,
    severity: 'important' as const,
    confidence: 85,
    file: 'src/core/types.ts',
    line: 42,
    category: 'spec-gap' as const,
    message: 'Missing skipped field in ReviewPass',
    fix: 'Add skipped: z.boolean().default(false)',
    spec_ref: 'A1: ReviewPass must include skipped field',
  }

  const validFindingQuality = {
    review_type: 'code-quality' as const,
    severity: 'critical' as const,
    confidence: 92,
    file: 'src/hooks/handlers/session-end.ts',
    line: 34,
    category: 'bug' as const,
    message:
      'exitCode hardcoded to 0 but handler can detect warning conditions',
    fix: 'Return exitCode 1 when session had unresolved warnings',
  }

  it('parses a valid two-pass ReviewReport', () => {
    const report = ReviewReport.parse({
      spec_compliance: {
        passed: true,
        findings: [validFindingSpec],
        skipped: false,
      },
      code_quality: {
        passed: true,
        findings: [validFindingQuality],
        skipped: false,
      },
      min_confidence: 80,
    })

    expect(report.spec_compliance.passed).toBe(true)
    expect(report.spec_compliance.findings).toHaveLength(1)
    expect(report.spec_compliance.findings[0]?.review_type).toBe(
      'spec-compliance',
    )
    expect(report.code_quality.passed).toBe(true)
    expect(report.code_quality.findings[0]?.review_type).toBe('code-quality')
    expect(report.min_confidence).toBe(80)
  })

  it('applies defaults for skipped and findings', () => {
    const pass = ReviewPass.parse({ passed: false })
    expect(pass.skipped).toBe(false)
    expect(pass.findings).toEqual([])
  })

  it('applies default min_confidence of 80', () => {
    const report = ReviewReport.parse({
      spec_compliance: { passed: true },
      code_quality: { passed: false, skipped: true },
    })
    expect(report.min_confidence).toBe(80)
  })

  it('rejects a finding missing review_type', () => {
    expect(() =>
      ReviewFinding.parse({
        // review_type omitted
        severity: 'important',
        confidence: 85,
        file: 'src/foo.ts',
        category: 'bug',
        message: 'Something is wrong',
      }),
    ).toThrow()
  })

  it('rejects severity outside the enum', () => {
    expect(() =>
      ReviewFinding.parse({
        review_type: 'code-quality',
        severity: 'high', // invalid — not in critical|important|suggestion
        confidence: 85,
        file: 'src/foo.ts',
        category: 'bug',
        message: 'Something is wrong',
      }),
    ).toThrow()
  })

  it('rejects confidence above 100', () => {
    expect(() =>
      ReviewFinding.parse({
        review_type: 'code-quality',
        severity: 'critical',
        confidence: 101,
        file: 'src/foo.ts',
        category: 'bug',
        message: 'Something is wrong',
      }),
    ).toThrow()
  })

  it('rejects confidence below 0', () => {
    expect(() =>
      ReviewFinding.parse({
        review_type: 'spec-compliance',
        severity: 'suggestion',
        confidence: -1,
        file: 'src/foo.ts',
        category: 'convention',
        message: 'Something is wrong',
      }),
    ).toThrow()
  })

  it('allows optional fields to be absent', () => {
    const finding = ReviewFinding.parse({
      review_type: 'code-quality',
      severity: 'suggestion',
      confidence: 82,
      file: 'src/core/types.ts',
      category: 'convention',
      message: 'Minor naming inconsistency',
    })
    expect(finding.line).toBeUndefined()
    expect(finding.fix).toBeUndefined()
    expect(finding.spec_ref).toBeUndefined()
  })
})
