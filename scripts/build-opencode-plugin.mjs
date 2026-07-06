#!/usr/bin/env node
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
/**
 * Phase 1 (v0.11.2 Bundle A) — build a self-contained ESM bundle of
 * src/opencode-plugin/index.ts → dist/opencode-plugin/index.js.
 *
 * OpenCode loads plugins via `await import("file://…")`.  ESM + node20 is
 * the only supported shape; the plugin imports only node:* builtins so
 * external:[] (bundle everything) is safe and produces a single file with
 * no runtime dependency on node_modules.
 */
import { build } from 'esbuild'

const ROOT = resolve(new URL('..', import.meta.url).pathname)
const out = `${ROOT}/dist/opencode-plugin/index.js`

await mkdir(`${ROOT}/dist/opencode-plugin`, { recursive: true })

// Bundle the production entry (plugin-entry.ts) NOT index.ts directly.
// The entry re-exports only `server` so OpenCode 1.15.3's PluginModule
// loader sees a clean single-export shape. Bundling index.ts directly
// exposes test helpers (AnvilPlugin, shutdownAnvilPlugin,
// __resetShutdownHandlersForTests) as additional named exports, causing
// OC's fallback plugin loader to invoke them as plugins and crash on the
// undefined return values with "plugin config hook failed".
await build({
  entryPoints: [`${ROOT}/src/opencode-plugin/plugin-entry.ts`],
  outfile: out,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  // No npm deps — only node:* builtins — so bundle everything.
  external: [],
  sourcemap: false,
  minify: false,
  logLevel: 'info',
})

console.log(
  `build-opencode-plugin: src/opencode-plugin/plugin-entry.ts → ${out}`,
)
