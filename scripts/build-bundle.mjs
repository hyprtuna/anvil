#!/usr/bin/env node
import { chmod, cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
/**
 * Plan 33 G1 — build a standalone self-contained bundle of the main Anvil CLI.
 *
 * Produces dist/anvil-bundle.cjs — a single-file CJS bundle with all runtime
 * dependencies inlined via esbuild. This is the file that ~/.anvil/runtime/
 * ships so user-facing shims (bin/anvil.cjs) work without node_modules/.
 *
 * The installer entry point (dist/installer-bundle.cjs) is built separately
 * so bin/install.cjs can invoke it.
 */
import { build } from 'esbuild'

const ROOT = resolve(new URL('..', import.meta.url).pathname)

async function bundle(entryPoint, outfile, label) {
  await build({
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    logLevel: 'error',
    sourcemap: false,
    // Bundle all npm deps so there's no node_modules dependency at runtime.
    // ANV-0248: mark the experimental register-cli as external so esbuild does
    // NOT inline it. The try/catch in src/index.ts gracefully handles the
    // case when the module is absent (default build = no experimental surface).
    // ANV-0247: mark the experimental notepads stash module as external so
    // esbuild does NOT inline it. The try/catch in on-large-output.ts handles
    // the absent-module case (ERR_MODULE_NOT_FOUND → silent no-op).
    external: [
      '*/experimental/register-cli.js',
      '*/experimental/notepads/core/stash.js',
    ],
    conditions: ['node', 'require', 'default'],
    // Shim import.meta.url for code that uses fileURLToPath(import.meta.url).
    // esbuild sets import.meta.url to undefined in CJS bundles without this.
    define: {
      'import.meta.url': '__importMetaUrl',
    },
    banner: {
      js: `const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;`,
    },
  })
  await chmod(outfile, 0o755)
  console.log(`build-bundle: ${label} → ${outfile}`)
}

await bundle(
  `${ROOT}/src/index.ts`,
  `${ROOT}/dist/anvil-bundle.cjs`,
  'main CLI',
)

await bundle(
  `${ROOT}/src/installer/cli.ts`,
  `${ROOT}/dist/installer-bundle.cjs`,
  'installer CLI',
)

// ANV-0161: stage data/ alongside the bundle so the installer (which mirrors
// dist/ to ~/.anvil/runtime/dist/) places data/model-capabilities.json where
// loadBundledSnapshot()'s bundled-layout candidate can find it at runtime.
await mkdir(`${ROOT}/dist/data`, { recursive: true })
await cp(
  `${ROOT}/data/model-capabilities.json`,
  `${ROOT}/dist/data/model-capabilities.json`,
)
console.log(`build-bundle: copied data/ → dist/data/`)
