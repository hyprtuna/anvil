/**
 * Plan 38 Phase D — Sub-D1 test:
 * `--tier=ultra` parsed and forwarded to `ResolveOptions.cli.tier`.
 */
import { describe, expect, it, vi } from 'vitest'

// We mock invokeSkill to capture what ResolveOptions are passed through
vi.mock('../../../../src/commands/cli/common/invoke.js', () => ({
  invokeSkill: vi.fn().mockResolvedValue(undefined),
}))

import { invokeSkill } from '../../../../src/commands/cli/common/invoke.js'
import { reviewCommand } from '../../../../src/commands/cli/review.js'

describe('review CLI command — --tier flag (Plan 38 Phase D)', () => {
  it('forwards tier=ultra to invokeSkill when --tier=ultra is passed', async () => {
    await reviewCommand('src/', { tier: 'ultra' })
    expect(invokeSkill).toHaveBeenCalledWith(
      'code-review',
      expect.stringContaining('Target: src/'),
      expect.objectContaining({ tier: 'ultra' }),
    )
  })

  it('forwards tier=quick to invokeSkill when --tier=quick is passed', async () => {
    await reviewCommand(undefined, { tier: 'quick' })
    expect(invokeSkill).toHaveBeenCalledWith(
      'code-review',
      expect.stringContaining('Target: staged'),
      expect.objectContaining({ tier: 'quick' }),
    )
  })

  it('passes no tier when --tier is not provided', async () => {
    await reviewCommand('src/')
    expect(invokeSkill).toHaveBeenCalledWith(
      'code-review',
      expect.stringContaining('Target: src/'),
      expect.objectContaining({ tier: undefined }),
    )
  })

  it('forwards both type and tier', async () => {
    await reviewCommand('src/', { type: 'code-quality', tier: 'review' })
    expect(invokeSkill).toHaveBeenCalledWith(
      'code-review',
      expect.stringContaining('ReviewType: code-quality'),
      expect.objectContaining({ tier: 'review' }),
    )
  })
})
