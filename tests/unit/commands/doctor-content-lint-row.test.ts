import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  findBrokenPlanRefs,
  findStencilLeakage,
  findUnversionedTodos,
} from '../../../src/commands/cli/doctor.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

/**
 * Plan 42 Phase B — anvil doctor "Skill content lint" row.
 *
 * D-05 patterns:
 * 1. Un-versioned TODO/FIXME/XXX without (v0.10.X) tag.
 * 2. Broken docs/anvil/plans/ cross-references (resolves against working tree).
 * 3. Stencil leakage placeholder phrases.
 *
 * Severity: warn-only (FP risk).
 */
describe('doctor — un-versioned TODO matcher', () => {
  it('flags bare TODO', () => {
    expect(findUnversionedTodos('TODO: refactor this')).toHaveLength(1)
  })

  it('flags FIXME and XXX markers', () => {
    expect(findUnversionedTodos('FIXME: do this later')).toHaveLength(1)
    expect(findUnversionedTodos('XXX(broken): see ticket')).toHaveLength(1)
  })

  it('does not flag versioned TODO', () => {
    expect(findUnversionedTodos('TODO(v0.10.5+ D-04): finalize')).toHaveLength(
      0,
    )
    expect(findUnversionedTodos('TODO(v0.10.6 D-01): later')).toHaveLength(0)
  })

  it('does not flag plain prose containing the word "todo"', () => {
    // Must be all-caps marker followed by `:` or `(`
    expect(findUnversionedTodos('Things on my todo list')).toHaveLength(0)
  })

  it('does not flag prose mentions of TODO without : or (', () => {
    // "No TODO comments left behind" — prose, not a marker
    expect(findUnversionedTodos('No TODO comments left behind')).toHaveLength(0)
  })
})

describe('doctor — broken plan reference matcher', () => {
  it('flags a plan path that does not exist', () => {
    const cwd = process.cwd()
    const text =
      'see [Plan 999](docs/anvil/plans/2099-01-01-999-fictional-plan.md) for details'
    expect(findBrokenPlanRefs(text, cwd)).toHaveLength(1)
  })

  it('does not flag a plan path that exists', () => {
    const tmp = createTestTmpDir('plan-ref')
    const rel = 'docs/anvil/plans/2026-04-28-41-example-plan.md'
    mkdirSync(join(tmp, 'docs', 'anvil', 'plans'), { recursive: true })
    writeFileSync(join(tmp, rel), '# plan\n')
    const text = `see [Plan 41](${rel})`
    expect(findBrokenPlanRefs(text, tmp)).toHaveLength(0)
  })

  it('returns empty for text without plan refs', () => {
    expect(findBrokenPlanRefs('no plan refs here', process.cwd())).toHaveLength(
      0,
    )
  })
})

describe('doctor — stencil leakage matcher', () => {
  it('flags "your skill name here"', () => {
    expect(findStencilLeakage('name: your skill name here')).toHaveLength(1)
  })

  it('flags "TODO: replace this"', () => {
    expect(findStencilLeakage('# TODO: replace this section')).toHaveLength(1)
  })

  it('flags "<!-- placeholder -->"', () => {
    expect(findStencilLeakage('<!-- placeholder -->')).toHaveLength(1)
  })

  it('flags "lorem ipsum"', () => {
    expect(findStencilLeakage('Lorem ipsum dolor sit amet')).toHaveLength(1)
  })

  it('does not flag clean content', () => {
    expect(findStencilLeakage('Use when editing TypeScript code')).toHaveLength(
      0,
    )
  })
})
