/**
 * tests/unit/agents/is-retryable.test.ts
 *
 * Table-driven unit tests for the `isRetryableSDKError` helper (Plan 33 D3).
 * Verifies the whitelist/blacklist contract exhaustively.
 */

import { describe, expect, it } from 'vitest'
import { isRetryableSDKError } from '../../../src/core/models/retry.js'

function makeError(code: string, message = `SDK: ${code}`): Error {
  const err = new Error(message)
  ;(err as NodeJS.ErrnoException).code = code
  return err
}

describe('isRetryableSDKError', () => {
  // ── Whitelist ──────────────────────────────────────────────────────────────
  it.each([['model_not_available'], ['rate_limit_exceeded']])(
    'returns true for retryable code: %s',
    (code) => {
      expect(isRetryableSDKError(makeError(code))).toBe(true)
    },
  )

  // ── Blacklist ──────────────────────────────────────────────────────────────
  it.each([
    ['authentication_error'],
    ['permission_error'],
    ['invalid_request_error'],
    ['not_found_error'],
    ['ECONNREFUSED'],
    ['ENOTFOUND'],
    ['ETIMEDOUT'],
  ])('returns false for non-retryable code: %s', (code) => {
    expect(isRetryableSDKError(makeError(code))).toBe(false)
  })

  // ── Edge cases ─────────────────────────────────────────────────────────────
  it('returns false for plain Error with no code property', () => {
    expect(isRetryableSDKError(new Error('something went wrong'))).toBe(false)
  })

  it('returns false for null', () => {
    expect(isRetryableSDKError(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isRetryableSDKError(undefined)).toBe(false)
  })

  it('returns false for a string error', () => {
    expect(isRetryableSDKError('rate_limit_exceeded')).toBe(false)
  })

  it('returns false for an object without a code property', () => {
    expect(isRetryableSDKError({ message: 'rate_limit_exceeded' })).toBe(false)
  })

  it('returns true when code is set on a non-standard error object', () => {
    const obj = { code: 'model_not_available', message: 'unavailable' }
    expect(isRetryableSDKError(obj)).toBe(true)
  })
})
