import { describe, expect, it } from 'vitest'
import { APPROVED_AGENT_SUFFIXES, endsInApprovedSuffix } from './rename-map.js'
import { slugFromPath, walkMd } from './walk.js'

/**
 * Hard rule (3): Agents MUST end in an approved doer-suffix.
 */

describe('naming — agent-suffix-rule (Plan 40 D-01 hard rule 3)', () => {
  const agentSlugs = walkMd('agents').map(slugFromPath).sort()

  it('every agent slug ends in an approved doer-suffix', () => {
    const violators = agentSlugs.filter((s) => endsInApprovedSuffix(s) === null)
    expect(
      violators,
      `agents must end in one of: ${APPROVED_AGENT_SUFFIXES.join(', ')}; violators: ${violators.join(', ')}`,
    ).toEqual([])
  })
})
