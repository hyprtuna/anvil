/**
 * ANV-0007 — doctor row test for doc-drift lint.
 *
 * Tests that runDocDriftLint integrates cleanly: the lint engine returns
 * a typed result and the summary formatter produces the expected shape.
 * We do not re-test every lint rule here — those live in
 * tests/unit/docs/doc-drift-lint.test.ts.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  formatDocDriftSummary,
  runDocDriftLint,
} from '../../../src/core/docs/lint/index.js'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = join(tmpdir(), `anvil-ddr-${Date.now()}`)
  mkdirSync(tmpRoot, { recursive: true })
})

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

function write(relPath: string, content: string): void {
  const abs = join(tmpRoot, relPath)
  mkdirSync(join(tmpRoot, relPath.split('/').slice(0, -1).join('/')), {
    recursive: true,
  })
  writeFileSync(abs, content, 'utf-8')
}

describe('doctor doc-drift row — runDocDriftLint + formatDocDriftSummary', () => {
  it('pass: zero violations → summary says "no drift found"', () => {
    write('README.md', '# Anvil\n')
    const result = runDocDriftLint(tmpRoot)
    expect(result.violations).toHaveLength(0)
    const summary = formatDocDriftSummary(result)
    expect(summary).toMatch(/no drift found/)
  })

  it('warn: violations present → summary includes violation count', () => {
    write('README.md', '[broken](docs/architecture.md)\n')
    const result = runDocDriftLint(tmpRoot)
    expect(result.violations.length).toBeGreaterThan(0)
    const summary = formatDocDriftSummary(result)
    expect(summary).toMatch(/violation/)
  })
})
