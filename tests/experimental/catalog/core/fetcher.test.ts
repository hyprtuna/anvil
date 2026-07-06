import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetchUrl } from '../../../../src/experimental/catalog/core/fetcher.js'
import type { FetchError } from '../../../../src/experimental/catalog/core/fetcher.js'

// ─── ANVIL_OFFLINE tests ───────────────────────────────────────────────────

describe('fetchUrl — ANVIL_OFFLINE=1', () => {
  let originalOffline: string | undefined

  beforeAll(() => {
    originalOffline = process.env.ANVIL_OFFLINE
    process.env.ANVIL_OFFLINE = '1'
  })

  afterAll(() => {
    process.env.ANVIL_OFFLINE = originalOffline
  })

  it('returns OFFLINE error without making a network call', async () => {
    // Inject a mock that throws if called — to prove no network call is made
    let wasCalled = false
    const mockFetch = async (_url: string): Promise<Response> => {
      wasCalled = true
      throw new Error('network call was made in OFFLINE mode')
    }

    const result = await fetchUrl('https://example.com/index.json', mockFetch)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('OFFLINE')
    }
    expect(wasCalled).toBe(false)
  })
})

// ─── Non-HTTPS URL rejection ────────────────────────────────────────────────

describe('fetchUrl — non-HTTPS rejection', () => {
  let originalOffline: string | undefined

  beforeAll(() => {
    originalOffline = process.env.ANVIL_OFFLINE
    process.env.ANVIL_OFFLINE = undefined
  })

  afterAll(() => {
    if (originalOffline !== undefined) {
      process.env.ANVIL_OFFLINE = originalOffline
    }
  })

  it('rejects http:// URL with NON_HTTPS error', async () => {
    const mockFetch = async (_url: string): Promise<Response> => {
      throw new Error('should not reach network')
    }

    const result = await fetchUrl('http://example.com/index.json', mockFetch)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('NON_HTTPS')
    }
  })

  it('rejects ftp:// URL with NON_HTTPS error', async () => {
    const mockFetch = async (_url: string): Promise<Response> => {
      throw new Error('should not reach network')
    }

    const result = await fetchUrl('ftp://example.com/file', mockFetch)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('NON_HTTPS')
    }
  })
})

// ─── In-process HTTP server tests ──────────────────────────────────────────

describe('fetchUrl — mock fetch implementation', () => {
  let originalOffline: string | undefined

  beforeAll(() => {
    originalOffline = process.env.ANVIL_OFFLINE
    process.env.ANVIL_OFFLINE = undefined
  })

  afterAll(() => {
    if (originalOffline !== undefined) {
      process.env.ANVIL_OFFLINE = originalOffline
    }
  })

  it('returns bytes for a successful response via injected fetch', async () => {
    const body = new Uint8Array([10, 20, 30])

    const mockFetch = async (_url: string): Promise<Response> => {
      return new Response(body, { status: 200 })
    }

    const result = await fetchUrl('https://example.com/data', mockFetch)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual(body)
    }
  })

  it('returns HTTP_STATUS error for non-2xx response', async () => {
    const mockFetch = async (_url: string): Promise<Response> => {
      return new Response('Not Found', { status: 404 })
    }

    const result = await fetchUrl('https://example.com/missing', mockFetch)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('HTTP_STATUS')
      expect(
        (result.error as Extract<FetchError, { kind: 'HTTP_STATUS' }>).status,
      ).toBe(404)
    }
  })

  it('returns HTTP_STATUS error for 5xx response', async () => {
    const mockFetch = async (_url: string): Promise<Response> => {
      return new Response('Server Error', { status: 500 })
    }

    const result = await fetchUrl('https://example.com/error', mockFetch)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('HTTP_STATUS')
      expect(
        (result.error as Extract<FetchError, { kind: 'HTTP_STATUS' }>).status,
      ).toBe(500)
    }
  })

  it('returns NETWORK error on fetch exception', async () => {
    const mockFetch = async (_url: string): Promise<Response> => {
      throw new Error('ECONNREFUSED')
    }

    const result = await fetchUrl('https://example.com/data', mockFetch)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('NETWORK')
      expect(
        (result.error as Extract<FetchError, { kind: 'NETWORK' }>).detail,
      ).toContain('ECONNREFUSED')
    }
  })

  it('returns TOO_LARGE when response exceeds 256 MiB', async () => {
    const MAX = 256 * 1024 * 1024 // 256 MiB
    const oversizedBody = new Uint8Array(MAX + 1)

    const mockFetch = async (_url: string): Promise<Response> => {
      return new Response(oversizedBody, {
        status: 200,
        headers: { 'content-length': String(MAX + 1) },
      })
    }

    const result = await fetchUrl('https://example.com/huge', mockFetch)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('TOO_LARGE')
    }
  })

  it('returns TOO_LARGE based on Content-Length header alone', async () => {
    const MAX = 256 * 1024 * 1024

    const mockFetch = async (_url: string): Promise<Response> => {
      // Content-Length says too large, but we don't actually read the body
      return new Response(new Uint8Array(1), {
        status: 200,
        headers: { 'content-length': String(MAX + 1) },
      })
    }

    const result = await fetchUrl(
      'https://example.com/huge-declared',
      mockFetch,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('TOO_LARGE')
    }
  })
})
