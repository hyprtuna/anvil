/**
 * Unit tests for src/core/strip-x-anvil.ts.
 *
 * Gate-3 Crit 4 adds: first-line x-anvil: case (no preceding \n in frontmatter).
 */

import { describe, expect, it } from 'vitest'
import { stripXAnvil } from '../../../src/core/strip-x-anvil.js'

describe('stripXAnvil', () => {
  it('returns content unchanged when no frontmatter', () => {
    const content = 'No frontmatter here.\n'
    expect(stripXAnvil(content)).toBe(content)
  })

  it('returns content unchanged when no x-anvil: key', () => {
    const content = `---
name: my-skill
description: A skill
---

Body.`
    expect(stripXAnvil(content)).toBe(content)
  })

  it('strips mid-frontmatter x-anvil: block (standard case)', () => {
    const content = `---
name: my-skill
description: A skill
x-anvil:
  tier: planning
  role: orchestrator
---

Body.`
    const result = stripXAnvil(content)
    expect(result).not.toContain('x-anvil:')
    expect(result).toContain('name: my-skill')
    expect(result).toContain('description: A skill')
    expect(result).toContain('Body.')
  })

  it('strips x-anvil: when it is the FIRST line of frontmatter (Gate-3 Crit 4)', () => {
    // Previously the regex required a leading \n so this case was a no-op.
    const content = '---\nx-anvil:\n  tier: planning\n---\n'
    const result = stripXAnvil(content)
    expect(result).not.toContain('x-anvil:')
    // After stripping, the frontmatter should be empty (just the delimiters).
    expect(result).toBe('---\n---\n')
  })

  it('strips x-anvil: as first line with additional root keys after the block', () => {
    const content = `---
x-anvil:
  tier: planning
  role: worker
name: my-skill
description: A skill
---

Body text.`
    const result = stripXAnvil(content)
    expect(result).not.toContain('x-anvil:')
    expect(result).toContain('name: my-skill')
    expect(result).toContain('description: A skill')
    expect(result).toContain('Body text.')
  })

  it('is idempotent — stripping twice gives the same result', () => {
    const content = `---
name: my-skill
x-anvil:
  tier: quick
---

Body.`
    const once = stripXAnvil(content)
    const twice = stripXAnvil(once)
    expect(twice).toBe(once)
  })

  it('handles malformed frontmatter (no closing delimiter) without modification', () => {
    const content = `---
name: unclosed
x-anvil:
  tier: quick
`
    expect(stripXAnvil(content)).toBe(content)
  })
})
