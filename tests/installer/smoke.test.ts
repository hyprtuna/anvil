import { execSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('smoke-install matrix', () => {
  it('all rows pass', () => {
    expect(() =>
      execSync('scripts/smoke-install.sh', { stdio: 'inherit' }),
    ).not.toThrow()
  }, 300_000)
})
