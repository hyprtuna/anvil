/**
 * ANV-0106 — skill-e2e for slop-removal.
 *
 * Behavioral compliance: given a slop-heavy code sample, the agent
 * should identify over-commenting or excessive abstraction.
 */

import { describe, it } from 'vitest'
import { runSkillE2E } from './helpers.js'

const SLOPPY_SAMPLE = `\
// AbstractUserRepositoryFactoryProvider implementation
// This class provides a factory for creating user repository instances
export class AbstractUserRepositoryFactoryProvider {
  // The user repository factory instance
  private factory: UserRepositoryFactory
  // Constructor: takes a factory and stores it
  constructor(factory: UserRepositoryFactory) {
    // Store the factory
    this.factory = factory
  }
  // Get the user repository
  // Returns the user repository created by the factory
  getUserRepository(): UserRepository {
    // Use the factory to create the user repository
    return this.factory.createUserRepository()
  }
}
`

describe('skill-e2e: slop-removal', () => {
  it('identifies over-commenting / over-abstraction in AI slop', async () => {
    await runSkillE2E({
      slug: 'slop-removal',
      file: { relativePath: 'universal/slop-removal.md' },
      userPrompt: `Clean up this code:\n\n${SLOPPY_SAMPLE}`,
      fakeOutputText:
        'This sample has two main slop patterns:\n' +
        '1. Excessive commenting: every line restates what the code already says.\n' +
        '2. Over-abstraction: AbstractUserRepositoryFactoryProvider is a wrapper around a factory with no added behavior — collapse it.\n' +
        'Remove the redundant comments and inline the factory call directly at the call site.',
      assertions: [
        {
          label: 'identifies over-commenting',
          predicate: (t) => /comment|redundan|restate|obvious/i.test(t),
        },
        {
          label: 'identifies over-abstraction',
          predicate: (t) =>
            /abstract|wrapper|unnecessary|collapse|inline|over-engineer/i.test(
              t,
            ),
        },
      ],
    })
  })
})
