/**
 * ANV-0028 (P4) — Bundled catalog source definitions.
 *
 * Layer 0 — pure constant; no I/O.
 *
 * Future ticket adds user-configurable sources; v0.15.7 ships built-in only.
 * When that ticket lands, the CLI `list-sources` command should merge
 * BUILTIN_SOURCES with any user-defined sources from ~/.anvil/catalog-sources.json.
 */

import type { CatalogSource } from './types.js'

/**
 * Module-local mutable source list. Production code reads via `getBuiltInSources()`.
 * Tests may override via `_setBuiltInSourcesForTest()` — see seam note below.
 *
 * NOTE (test seam, ANV-0028 P5): `_setBuiltInSourcesForTest` / `getBuiltInSources`
 * is the smallest seam needed for the integration round-trip test to inject a
 * fake HTTP server URL without touching real network. The seam mutates a
 * module-local variable; tests must restore via `_setBuiltInSourcesForTest`
 * in `afterAll` / `afterEach`. Production code never calls the setter.
 */
let _builtinSources: CatalogSource[] = [
  {
    id: 'wshobson',
    display_name: 'wshobson/agents',
    // Illustrative URL — see note above. Real index will be confirmed by a
    // follow-up ticket coordinating with upstream.
    index_url:
      'https://raw.githubusercontent.com/wshobson/agents/main/INDEX.json',
    trust_tier: 'community',
  },
]

/**
 * The built-in catalog source list for v0.15.7.
 *
 * NOTE: The index_url below is illustrative for v0.15.7. The wshobson/agents
 * repository does not currently publish an ANV-0028-compatible INDEX.json at
 * this URL. A follow-up ticket will coordinate with upstream maintainers or
 * maintain a fork-hosted index. The URL format documents what a community
 * catalog index should look like.
 */
export const BUILTIN_SOURCES: CatalogSource[] = _builtinSources

/**
 * Return the current built-in source list. Production code should use this
 * accessor rather than the `BUILTIN_SOURCES` export directly so that the
 * test seam below takes effect.
 */
export function getBuiltInSources(): CatalogSource[] {
  return _builtinSources
}

/**
 * TEST SEAM — do NOT call from production code.
 *
 * Replaces the module-local source list used by `getBuiltInSources()`.
 * The integration round-trip test calls this in `beforeAll` with a fake source
 * pointing at an in-process HTTP server, then restores the original in `afterAll`.
 *
 * Example:
 *   const orig = getBuiltInSources()
 *   _setBuiltInSourcesForTest([{ id: 'test', ... }])
 *   afterAll(() => _setBuiltInSourcesForTest(orig))
 */
export function _setBuiltInSourcesForTest(sources: CatalogSource[]): void {
  _builtinSources = sources
}
