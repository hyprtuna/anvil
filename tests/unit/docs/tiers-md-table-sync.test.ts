import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AgentTier } from '../../../src/core/types.js'

// ANV-0131: moved from docs/anvil/tiers.md to .anvil/specs/tiers.md
const TIERS_MD_PATH = join(process.cwd(), '.anvil/specs/tiers.md')

describe('.anvil/specs/tiers.md — tier table sync with AgentTier enum', () => {
  it('every AgentTier enum value appears in the tiers.md tier table', () => {
    const content = readFileSync(TIERS_MD_PATH, 'utf8')
    const enumValues = AgentTier.options

    for (const tier of enumValues) {
      expect(content).toContain(`\`${tier}\``)
    }
  })
})
