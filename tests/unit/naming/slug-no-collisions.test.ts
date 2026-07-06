import { describe, expect, it } from 'vitest'
import { slugFromPath, walkMd } from './walk.js'

/**
 * Hard rule (1): No slug collisions across surfaces.
 *
 * agent-slug-set ∩ skill-slug-set MUST be empty.
 */

describe('naming — slug-no-collisions (Plan 40 D-01 hard rule 1)', () => {
  const skillSlugs = new Set(walkMd('skills').map(slugFromPath))
  const agentSlugs = new Set(walkMd('agents').map(slugFromPath))

  it('agent slug set and skill slug set are disjoint', () => {
    const collisions = [...agentSlugs].filter((s) => skillSlugs.has(s))
    expect(
      collisions,
      `slug collisions across agents and skills: ${collisions.join(', ')}`,
    ).toEqual([])
  })
})
