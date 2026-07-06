/**
 * Single source of truth for prompt-injection / scanning regex patterns.
 * Consumed by `prompt-guard` (file-write scan) and any future handler that
 * needs the same coverage.
 *
 * Adding a pattern here is cheap; every dedicated-handler duplicate was
 * a silent drift vector.
 */

export type InjectionSeverity = 'warn' | 'block'

export interface InjectionPattern {
  name: string
  pattern: RegExp
  severity: InjectionSeverity
}

export const InjectionPatterns: InjectionPattern[] = [
  {
    name: 'role override',
    pattern: /system:\s*you are/i,
    severity: 'warn',
  },
  {
    name: 'instruction bypass',
    pattern: /ignore (?:all )?(?:previous |prior )?instructions/i,
    severity: 'warn',
  },
  {
    name: 'system tag injection',
    pattern: /<system>/i,
    severity: 'warn',
  },
  {
    name: 'instruction tag injection',
    pattern: /\[INST\]/i,
    severity: 'warn',
  },
  {
    name: 'system prompt injection',
    pattern: /<<SYS>>/i,
    severity: 'warn',
  },
  {
    name: 'invisible unicode',
    pattern: /[\u200B-\u200F\u2028-\u202F\uFEFF]/g,
    severity: 'warn',
  },
]

export function matchInjectionPatterns(content: string): string[] {
  const findings: string[] = []
  for (const { pattern, name } of InjectionPatterns) {
    if (pattern.test(content)) findings.push(name)
  }
  return findings
}
