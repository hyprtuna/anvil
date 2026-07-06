/**
 * ANV-0028 (P1) — Minimal HTTPS GET fetcher for catalog artifacts.
 *
 * Layer 0 — network I/O wrapper. Returns a Result type; never throws.
 *
 * Design decisions:
 * - Uses globalThis.fetch (Node 18+ / Bun). No third-party HTTP library.
 * - Accepts an optional `fetchImpl` parameter for dependency injection in tests,
 *   avoiding the need for a real HTTPS server with self-signed certs.
 * - ANVIL_OFFLINE=1 short-circuits ALL network calls immediately.
 * - Size cap: 256 MiB (CATALOG_MAX_BYTES from types.ts, mirrors EXTRACT_MAX_BYTES).
 * - Rejects non-HTTPS URLs before making any network attempt.
 */

import { CATALOG_MAX_BYTES } from './types.js'

// ─── Result type (local — mirrors installer/extensions/types.ts) ─────────
// Defined locally to avoid an upward layer-0 → layer-7 import.
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

// ─── FetchError discriminated union ──────────────────────────────────────

export type FetchError =
  | { kind: 'OFFLINE' }
  | { kind: 'NON_HTTPS' }
  | { kind: 'TOO_LARGE'; size: number }
  | { kind: 'NETWORK'; detail: string }
  | { kind: 'HTTP_STATUS'; status: number }

// ─── Fetch implementation type ────────────────────────────────────────────

/** The subset of the Fetch API this module requires. */
type FetchImpl = (url: string) => Promise<Response>

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Fetch a URL and return its body as bytes.
 *
 * @param url - The URL to fetch. Must use HTTPS.
 * @param fetchImpl - Optional fetch implementation (defaults to globalThis.fetch).
 *   Pass a mock in tests to avoid real network calls.
 * @returns A Result containing the response bytes or a FetchError.
 */
export async function fetchUrl(
  url: string,
  fetchImpl: FetchImpl = globalThis.fetch as FetchImpl,
): Promise<Result<Uint8Array, FetchError>> {
  // 1. Honour ANVIL_OFFLINE — no network call whatsoever
  if (process.env.ANVIL_OFFLINE === '1') {
    return { ok: false, error: { kind: 'OFFLINE' } }
  }

  // 2. Reject non-HTTPS URLs
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return {
      ok: false,
      error: { kind: 'NETWORK', detail: `Invalid URL: ${url}` },
    }
  }

  // NOTE: ANVIL_ALLOW_HTTP_TESTING=1 bypasses the HTTPS check for integration
  // tests that use in-process HTTP servers. Never set this in production.
  if (
    parsed.protocol !== 'https:' &&
    process.env.ANVIL_ALLOW_HTTP_TESTING !== '1'
  ) {
    return { ok: false, error: { kind: 'NON_HTTPS' } }
  }

  // 3. Perform the fetch
  let response: Response
  try {
    response = await fetchImpl(url)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { kind: 'NETWORK', detail } }
  }

  // 4. Check HTTP status
  if (!response.ok) {
    return {
      ok: false,
      error: { kind: 'HTTP_STATUS', status: response.status },
    }
  }

  // 5. Check Content-Length header before reading body
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null) {
    const declaredSize = Number.parseInt(contentLength, 10)
    if (!Number.isNaN(declaredSize) && declaredSize > CATALOG_MAX_BYTES) {
      return {
        ok: false,
        error: { kind: 'TOO_LARGE', size: declaredSize },
      }
    }
  }

  // 6. Read body bytes
  let bytes: Uint8Array
  try {
    const arrayBuffer = await response.arrayBuffer()
    bytes = new Uint8Array(arrayBuffer)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { kind: 'NETWORK', detail } }
  }

  // 7. Check actual body size
  if (bytes.byteLength > CATALOG_MAX_BYTES) {
    return {
      ok: false,
      error: { kind: 'TOO_LARGE', size: bytes.byteLength },
    }
  }

  return { ok: true, value: bytes }
}
