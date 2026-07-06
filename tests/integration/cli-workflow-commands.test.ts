import { afterEach, describe, expect, it, vi } from 'vitest'
import { debugCommand } from '../../src/commands/cli/debug.js'
import { exploreCommand } from '../../src/commands/cli/explore.js'
import { planCommand } from '../../src/commands/cli/plan.js'
import { reviewCommand } from '../../src/commands/cli/review.js'
import { tddCommand } from '../../src/commands/cli/tdd.js'

describe('integration: workflow CLI commands', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>
  afterEach(() => {
    writeSpy?.mockRestore()
  })

  it('plan prints the planning prompt', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await planCommand('build login form')
    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('Goal: build login form')
  })

  it('review defaults target to "staged"', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await reviewCommand()
    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('Target: staged')
  })

  it('debug prints the debugging prompt', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await debugCommand('null pointer in login')
    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('Issue: null pointer in login')
  })

  it('tdd invokes test-driven-development', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await tddCommand('sum function')
    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('Feature to TDD: sum function')
  })

  it('explore defaults to cwd', async () => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await exploreCommand()
    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('Path to explore:')
  })
})
