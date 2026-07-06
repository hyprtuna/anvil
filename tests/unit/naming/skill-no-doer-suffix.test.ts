import { describe, expect, it } from 'vitest'
import { APPROVED_AGENT_SUFFIXES, endsInApprovedSuffix } from './rename-map.js'
import { slugFromPath, walkMd } from './walk.js'

/**
 * Hard rule (2): Skills MUST NOT end in any approved doer-suffix.
 */

describe('naming — skill-no-doer-suffix (Plan 40 D-01 hard rule 2)', () => {
  const skillSlugs = walkMd('skills').map(slugFromPath).sort()

  it('no skill slug ends in any approved doer-suffix', () => {
    const violators = skillSlugs
      .map((s) => ({ slug: s, sfx: endsInApprovedSuffix(s) }))
      .filter((x) => x.sfx !== null)
    const msg = violators.map((v) => `${v.slug} (${v.sfx})`).join(', ')
    expect(
      violators,
      `skills must not end in approved agent doer-suffix: ${APPROVED_AGENT_SUFFIXES.join(', ')}; violators: ${msg}`,
    ).toEqual([])
  })
})
