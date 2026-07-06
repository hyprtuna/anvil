import { describe, expect, it } from 'vitest'
import { countHandlerLoc } from '../../../src/commands/cli/doctor.js'

/**
 * Plan 42 Phase B — anvil doctor "Hook handler size" row.
 *
 * Threshold: 200 source lines of code per src/hooks/handlers/*.ts file.
 * LOC excludes blank lines, single-line `//` comments, block-comment
 * line ranges, and `import` lines. Severity is warn-only — never blocks CI.
 *
 * D-04: threshold sits one growth-step above the largest current handler.
 */
describe('doctor — Hook handler size LOC counter', () => {
  it('counts a clean handler', () => {
    const src = [
      "import { foo } from 'bar'",
      '',
      'export function handler() {',
      '  return foo()',
      '}',
    ].join('\n')
    expect(countHandlerLoc(src)).toBe(3)
  })

  it('excludes blank lines', () => {
    const src = ['function a() {}', '', '', 'function b() {}', ''].join('\n')
    expect(countHandlerLoc(src)).toBe(2)
  })

  it('excludes single-line // comments', () => {
    const src = ['// note', 'function a() {}', '  // indented note'].join('\n')
    expect(countHandlerLoc(src)).toBe(1)
  })

  it('excludes /* ... */ block comments', () => {
    const src = ['/* block', ' * comment', ' */', 'function a() {}'].join('\n')
    expect(countHandlerLoc(src)).toBe(1)
  })

  it('excludes import lines', () => {
    const src = [
      "import { x } from 'y'",
      "import type { Z } from 'w'",
      'function a() {}',
    ].join('\n')
    expect(countHandlerLoc(src)).toBe(1)
  })

  it('returns >200 for synthetic large handler', () => {
    // 250 logical lines of code
    const lines: string[] = []
    for (let i = 0; i < 250; i++) lines.push(`const x${i} = ${i}`)
    expect(countHandlerLoc(lines.join('\n'))).toBe(250)
  })
})
