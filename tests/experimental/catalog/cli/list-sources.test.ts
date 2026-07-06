/**
 * Tests for `anvil catalog list-sources`.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listSourcesCommand } from '../../../../src/experimental/catalog/cli/list-sources.js'
import { BUILTIN_SOURCES } from '../../../../src/experimental/catalog/core/sources.js'

let stdoutCapture: string[]
let origWrite: typeof process.stdout.write

beforeEach(() => {
  stdoutCapture = []
  origWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk: unknown) => {
    stdoutCapture.push(String(chunk))
    return true
  }
})

afterEach(() => {
  process.stdout.write = origWrite
})

describe('listSourcesCommand', () => {
  it('exits 0', async () => {
    const code = await listSourcesCommand({})
    expect(code).toBe(0)
  })

  it('json output includes BUILTIN_SOURCES', async () => {
    const code = await listSourcesCommand({ json: true })
    expect(code).toBe(0)
    const output = stdoutCapture.join('')
    const parsed = JSON.parse(output) as unknown[]
    expect(parsed).toEqual(BUILTIN_SOURCES)
  })

  it('human output mentions source id', async () => {
    const code = await listSourcesCommand({})
    expect(code).toBe(0)
    const output = stdoutCapture.join('')
    expect(output).toContain('wshobson')
  })
})
