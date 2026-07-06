/**
 * Unit tests for filterEmittableSlashCommands (ANV-0257).
 *
 * Tests the shared experimental-command filter extracted from the CC adapter.
 * The function lives in src/core/slash-filter.ts.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  type SlashFile,
  filterEmittableSlashCommands,
} from '../../../../src/core/slash-filter.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(name: string, content: string): SlashFile {
  return { name, content }
}

const STANDARD_FRONTMATTER = `---
name: test-command
description: A test slash command.
---

# /test-command

Body text.
`

const EXPERIMENTAL_TRUE_FRONTMATTER = `---
name: experimental-command
description: An experimental slash command.
experimental: true
---

# /experimental-command

Body text.
`

const EXPERIMENTAL_STRING_FRONTMATTER = `---
name: quasi-experimental
description: experimental is a string, not a boolean.
experimental: "true"
---

# /quasi-experimental

Body text.
`

const NO_FRONTMATTER = `# /no-frontmatter-command

This file has no frontmatter at all.
`

const MALFORMED_FRONTMATTER = `---
name: bad-command
description: [unclosed bracket
---

# /bad-command

Body.
`

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('filterEmittableSlashCommands', () => {
  describe('happy path — non-experimental files pass through', () => {
    it('returns a file with standard frontmatter (no experimental key)', () => {
      const file = makeFile('test.md', STANDARD_FRONTMATTER)
      const result = filterEmittableSlashCommands([file])
      expect(result).toHaveLength(1)
      expect(result[0]).toBe(file)
    })

    it('returns multiple non-experimental files unchanged', () => {
      const files = [
        makeFile('a.md', STANDARD_FRONTMATTER),
        makeFile('b.md', STANDARD_FRONTMATTER),
        makeFile('c.md', NO_FRONTMATTER),
      ]
      const result = filterEmittableSlashCommands(files)
      expect(result).toHaveLength(3)
    })

    it('returns an empty array when input is empty', () => {
      expect(filterEmittableSlashCommands([])).toEqual([])
    })
  })

  describe('experimental: true filtering', () => {
    it('excludes a file with experimental: true in frontmatter', () => {
      const file = makeFile('experimental.md', EXPERIMENTAL_TRUE_FRONTMATTER)
      const result = filterEmittableSlashCommands([file])
      expect(result).toHaveLength(0)
    })

    it('excludes only experimental files from a mixed list', () => {
      const normal = makeFile('normal.md', STANDARD_FRONTMATTER)
      const experimental = makeFile(
        'experimental.md',
        EXPERIMENTAL_TRUE_FRONTMATTER,
      )
      const result = filterEmittableSlashCommands([normal, experimental])
      expect(result).toHaveLength(1)
      expect(result[0]).toBe(normal)
    })

    it('excludes all experimental files when all are experimental', () => {
      const files = [
        makeFile('a.md', EXPERIMENTAL_TRUE_FRONTMATTER),
        makeFile('b.md', EXPERIMENTAL_TRUE_FRONTMATTER),
      ]
      const result = filterEmittableSlashCommands(files)
      expect(result).toHaveLength(0)
    })
  })

  describe('experimental with non-boolean values — treated as emittable', () => {
    it('keeps a file with experimental: "true" (string, not boolean)', () => {
      const file = makeFile('string-exp.md', EXPERIMENTAL_STRING_FRONTMATTER)
      const result = filterEmittableSlashCommands([file])
      expect(result).toHaveLength(1)
      expect(result[0]).toBe(file)
    })

    it('keeps a file with experimental: false', () => {
      const content = `---
name: not-experimental
experimental: false
---
Body.
`
      const file = makeFile('not-exp.md', content)
      expect(filterEmittableSlashCommands([file])).toHaveLength(1)
    })

    it('keeps a file with experimental: 1 (numeric)', () => {
      const content = `---
name: numeric-exp
experimental: 1
---
Body.
`
      const file = makeFile('numeric.md', content)
      expect(filterEmittableSlashCommands([file])).toHaveLength(1)
    })
  })

  describe('missing frontmatter — treated as emittable (fail-open)', () => {
    it('keeps a file with no frontmatter block', () => {
      const file = makeFile('no-fm.md', NO_FRONTMATTER)
      const result = filterEmittableSlashCommands([file])
      expect(result).toHaveLength(1)
      expect(result[0]).toBe(file)
    })

    it('keeps a file with empty content', () => {
      const file = makeFile('empty.md', '')
      const result = filterEmittableSlashCommands([file])
      expect(result).toHaveLength(1)
    })
  })

  describe('malformed frontmatter — warns but does not throw (fail-open)', () => {
    it('keeps a file with malformed frontmatter and warns', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const file = makeFile('bad.md', MALFORMED_FRONTMATTER)
        // Should not throw
        const result = filterEmittableSlashCommands([file])
        // Fail-open: malformed frontmatter → emittable
        expect(result).toHaveLength(1)
        expect(result[0]).toBe(file)
      } finally {
        warnSpy.mockRestore()
      }
    })
  })

  describe('real slash command files — regression guard', () => {
    it('filters the known experimental slash commands (note, anvil-notepad-read/write, catalog)', () => {
      // These are the 4 files confirmed experimental as of v0.17.0 (ANV-0257).
      const experimentalNames = [
        'note.md',
        'anvil-notepad-read.md',
        'anvil-notepad-write.md',
        'catalog.md',
      ]
      const files = experimentalNames.map((name) =>
        makeFile(name, EXPERIMENTAL_TRUE_FRONTMATTER),
      )
      const result = filterEmittableSlashCommands(files)
      expect(result).toHaveLength(0)
    })
  })
})
