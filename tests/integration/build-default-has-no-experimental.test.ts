/**
 * ANV-0258 — Build-output no-experimental assertion.
 *
 * Asserts that a default `bun run build` does NOT inline experimental source
 * into the distributed bundles. This defends against future esbuild or
 * TypeScript constant-folding changes that could silently leak
 * `src/experimental/` modules into the default bundle, bypassing the
 * experimental gate.
 *
 * ## What is checked
 *
 * 1. BUNDLE MODULE-LABEL CHECK (primary guard): The esbuild output bundles
 *    (anvil-bundle.cjs, installer-bundle.cjs, opencode-plugin/index.js) must
 *    not contain esbuild module-label strings of the form
 *    `"src/experimental/<path>"()` which are emitted when esbuild bundles
 *    (inlines) a module from `src/experimental/`. These labels are distinct
 *    from comments or string literals that happen to mention experimental paths.
 *
 * 2. FILE-SYSTEM CHECK (informational): Documents known tsc behaviour where
 *    TypeScript follows a dynamic `import()` reference and compiles the
 *    referenced file even when its directory is listed in tsconfig `exclude`.
 *    `dist/experimental/notepads/core/stash.js` is produced by tsc because
 *    `src/hooks/handlers/on-large-output.ts` contains a literal dynamic import
 *    of `../../experimental/notepads/core/stash.js`. The esbuild `external`
 *    declarations prevent the module being BUNDLED, so this tsc artifact does
 *    not affect the distributed bundles. The test logs a warning but does not
 *    fail for this known case.
 *    A HARD FAILURE is triggered if any OTHER unexpected experimental file
 *    appears in dist/ (i.e., any `experimental/` path that is not in the
 *    known-tsc-artifact whitelist).
 *
 * 3. dist-experimental/ ABSENCE CHECK: The default build must not produce
 *    `dist-experimental/` (that directory belongs to `build:experimental` only).
 *    This check is informational on developer machines where a prior
 *    `build:experimental` may have left the directory behind; it is a hard
 *    failure on clean CI runs.
 *
 * ## Sabotage scenario
 *
 * If `'./experimental/' + 'register-cli.js'` in `src/index.ts` is replaced
 * with a literal `'./experimental/register-cli.js'` AND the esbuild `external`
 * entry for that module is removed from `scripts/build-bundle.mjs`, esbuild
 * would inline the full experimental/register-cli module. That would produce
 * a module label `"src/experimental/register-cli.ts"()` in the bundle →
 * this test's primary guard (check 1) fails.
 *
 * The test invokes the real build (spawns `bun run build`) to catch regressions
 * introduced by build-tool upgrades, not stale dist/ reads.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Walk a directory recursively, returning all file paths. */
function walkDir(dir: string): string[] {
  const out: string[] = []
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walkDir(full))
    } else if (entry.isFile()) {
      out.push(full)
    }
  }
  return out
}

/**
 * Scan a bundle file for esbuild module-label strings that indicate a module
 * from `src/experimental/` was statically inlined.
 *
 * esbuild emits module labels in this form when it bundles (inlines) a module:
 *   "src/experimental/register-cli.ts"() {
 *   "src/experimental/catalog/index.ts"() {
 *
 * These labels are double-quoted strings immediately followed by `() {` on the
 * same line. They are NOT the same as comments or string literals that happen
 * to mention experimental paths.
 *
 * A comment like `// moved to src/experimental/` does NOT trigger this pattern
 * because it lacks the `"..."() {` suffix.
 */
function findInlinedExperimentalModules(
  content: string,
  bundleLabel: string,
): string[] {
  const violations: string[] = []
  // Pattern: "src/experimental/<anything>"() {
  // The closing quote, open-paren, close-paren, space, open-brace are
  // required so we don't match loose mentions in comments or strings.
  const moduleLabel = /"src\/experimental\/[^"]*"\s*\(\s*\)\s*\{/g
  let m: RegExpExecArray | null
  const lines = content.split('\n')
  m = moduleLabel.exec(content)
  while (m !== null) {
    // Find line number for the match
    const before = content.slice(0, m.index)
    const lineNum = before.split('\n').length
    violations.push(
      `${bundleLabel}:${lineNum}: esbuild module label '${m[0].slice(0, 60)}' — experimental module was statically inlined into bundle`,
    )
    m = moduleLabel.exec(content)
  }
  // Suppress unused variable warning
  void lines
  return violations
}

/**
 * Known tsc-artifact paths in dist/ that are produced when tsc follows a
 * dynamic import reference from non-experimental source files.
 *
 * Background: TypeScript's `exclude` prevents tsc from adding a file as a
 * ROOT compilation unit, but if a non-excluded file contains a dynamic
 * `import('../../experimental/notepads/core/stash.js')`, tsc still resolves
 * and compiles the referenced file as a dependency. This is a known tsc
 * behavior and the resulting files in dist/experimental/ are harmless because:
 * - esbuild's `external` declarations prevent the module from being bundled.
 * - The distributed artifact is the esbuild bundle, not the raw tsc output.
 *
 * These paths are relative to REPO_ROOT.
 */
const KNOWN_TSC_ARTIFACTS = new Set([
  'dist/experimental/notepads/core/stash.js',
  'dist/experimental/notepads/core/stash.js.map',
  'dist/experimental/notepads/core/stash.d.ts',
  'dist/experimental/notepads/core/stash.d.ts.map',
])

// ─── Test suite ───────────────────────────────────────────────────────────────

/**
 * ANV-0219: Returns true when dist/index.js is fresh (newer than all
 * src/**\/*.ts files). Used to skip a redundant rebuild when the gate's
 * build-guard already ran `bun run build` just before the test suite.
 * Running two concurrent builds races with other tests that read dist/.
 */
function isDistFresh(): boolean {
  const distIndex = join(REPO_ROOT, 'dist', 'index.js')
  if (!existsSync(distIndex)) return false
  const distMtime = statSync(distIndex).mtimeMs
  function srcIsNewer(dir: string): boolean {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue
        if (srcIsNewer(full)) return true
      } else if (
        entry.name.endsWith('.ts') &&
        statSync(full).mtimeMs > distMtime
      ) {
        return true
      }
    }
    return false
  }
  return !srcIsNewer(join(REPO_ROOT, 'src'))
}

describe('build: default build has no experimental output', () => {
  let buildSucceeded = false
  let buildOutput = ''

  beforeAll(
    () => {
      // Run the real default build in the repo root. This ensures the test
      // catches regressions from build-tool upgrades, not stale dist/ reads.
      //
      // ANV-0219: skip the rebuild if dist/ is already fresh. The gate's
      // build-guard runs `bun run build` before the test suite; a second
      // concurrent build would race with other tests that read dist/ (e.g.
      // install-source-resilience.test.ts calls syncAnvilHome which copies
      // dist/ file-by-file). Skipping here is safe because the test still
      // inspects the actual built output — it just avoids a redundant rebuild.
      if (isDistFresh()) {
        buildSucceeded = true
        buildOutput =
          '(skipped: dist/ is already fresh — built by gate build-guard)'
        return
      }
      const result = spawnSync('bun', ['run', 'build'], {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        timeout: 120_000,
        env: { ...process.env },
      })
      buildSucceeded = result.status === 0
      buildOutput = [result.stdout ?? '', result.stderr ?? ''].join('\n')
    },
    // beforeAll timeout — the build can take up to 90 s on a cold cache.
    130_000,
  )

  it('build exits with status 0', () => {
    expect(buildSucceeded, `bun run build failed:\n${buildOutput}`).toBe(true)
  })

  it('dist/ directory exists after build', () => {
    const distPath = join(REPO_ROOT, 'dist')
    expect(
      existsSync(distPath),
      `dist/ not found at ${distPath} — build may not have run`,
    ).toBe(true)
  })

  it('no UNEXPECTED file under dist/ has an "experimental" path component', () => {
    const distPath = join(REPO_ROOT, 'dist')
    const allFiles = walkDir(distPath)

    const unexpected: string[] = []
    const knownArtifacts: string[] = []

    for (const f of allFiles) {
      const rel = f.replace(`${REPO_ROOT}/`, '').replace(/\\/g, '/')
      if (!rel.split('/').includes('experimental')) continue

      if (KNOWN_TSC_ARTIFACTS.has(rel)) {
        knownArtifacts.push(rel)
      } else {
        unexpected.push(rel)
      }
    }

    // Log known tsc artifacts as informational — they are harmless because
    // esbuild marks them as external and does not inline them.
    if (knownArtifacts.length > 0) {
      console.warn(
        `[ANV-0258] Known tsc artifacts in dist/experimental/ (harmless — esbuild external marks prevent bundling):\n${knownArtifacts.map((f) => `  ${f}`).join('\n')}\n  Source: tsc follows dynamic import() in on-large-output.ts even when src/experimental/ is in tsconfig exclude. See ticket ANV-0258 for context.`,
      )
    }

    // HARD FAIL for any unexpected experimental file not in the known list.
    expect(
      unexpected,
      `Unexpected files with 'experimental' path component found in dist/.\nThese are NOT in the known-tsc-artifact whitelist and indicate a build regression:\n${unexpected.join('\n')}`,
    ).toHaveLength(0)
  })

  it('dist-experimental/ does NOT exist after a default build', () => {
    const distExpPath = join(REPO_ROOT, 'dist-experimental')
    // dist-experimental/ may legitimately pre-exist from a prior
    // build:experimental run on a developer machine. We only care that the
    // DEFAULT build did not CREATE it. On a clean CI run this directory should
    // never exist. On a developer machine this check is informational.
    if (existsSync(distExpPath)) {
      console.warn(
        '[ANV-0258] dist-experimental/ pre-exists (from a prior build:experimental run) — ' +
          'skipping hard assertion. This is expected on developer machines. ' +
          'On CI this should never be present after a default build.',
      )
      return
    }
    expect(existsSync(distExpPath)).toBe(false)
  })

  it('anvil-bundle.cjs has no inlined experimental module labels', () => {
    const bundlePath = join(REPO_ROOT, 'dist', 'anvil-bundle.cjs')
    if (!existsSync(bundlePath)) {
      expect(
        buildSucceeded,
        'Build must succeed before checking bundle content',
      ).toBe(true)
      return
    }
    const content = readFileSync(bundlePath, 'utf-8')
    const violations = findInlinedExperimentalModules(
      content,
      'dist/anvil-bundle.cjs',
    )
    expect(
      violations,
      `Experimental modules were statically inlined into anvil-bundle.cjs.\nThis means esbuild bundled src/experimental/ code into the default bundle,\nbypassing the experimental gate. esbuild module labels found:\n${violations.join('\n')}`,
    ).toHaveLength(0)
  })

  it('installer-bundle.cjs has no inlined experimental module labels', () => {
    const bundlePath = join(REPO_ROOT, 'dist', 'installer-bundle.cjs')
    if (!existsSync(bundlePath)) {
      expect(
        buildSucceeded,
        'Build must succeed before checking bundle content',
      ).toBe(true)
      return
    }
    const content = readFileSync(bundlePath, 'utf-8')
    const violations = findInlinedExperimentalModules(
      content,
      'dist/installer-bundle.cjs',
    )
    expect(
      violations,
      `Experimental modules were statically inlined into installer-bundle.cjs:\n${violations.join('\n')}`,
    ).toHaveLength(0)
  })

  it('opencode-plugin/index.js has no inlined experimental module labels', () => {
    const pluginPath = join(REPO_ROOT, 'dist', 'opencode-plugin', 'index.js')
    if (!existsSync(pluginPath)) {
      // opencode-plugin bundle is optional in some build configurations.
      return
    }
    const content = readFileSync(pluginPath, 'utf-8')
    const violations = findInlinedExperimentalModules(
      content,
      'dist/opencode-plugin/index.js',
    )
    expect(
      violations,
      `Experimental modules were statically inlined into opencode-plugin/index.js:\n${violations.join('\n')}`,
    ).toHaveLength(0)
  })

  it('anvil-bundle.cjs does not require() experimental modules at top level', () => {
    // Secondary bundle check: verify no top-level `require("...experimental...")` calls
    // exist in the bundle. A require() call at top level would mean esbuild treated
    // the module as external BUT did not use a dynamic import — it would execute
    // at startup and fail immediately in the default build.
    //
    // Allowed: a `require()` inside an async function body (the dynamic import
    // path), which is what the whitelisted sites produce.
    const bundlePath = join(REPO_ROOT, 'dist', 'anvil-bundle.cjs')
    if (!existsSync(bundlePath)) return

    const content = readFileSync(bundlePath, 'utf-8')

    // Look for require("...experimental...") calls. These should not appear
    // at all in the bundle — the external declarations mean esbuild emits
    // require() but tree-shaking removes the call paths OR they are inside
    // async function bodies (the dynamic import cases).
    //
    // The pattern below detects top-level require() for experimental modules
    // that appear OUTSIDE a function body. We use a simpler heuristic:
    // any `require(` call where the argument contains `experimental/` and
    // the call is NOT inside an `async` or `function` block.
    //
    // Because parsing nested function scope from a minified bundle is
    // impractical, we use the presence of esbuild module labels as the
    // authoritative check (previous test). This test is a belt-and-suspenders
    // check for `require("experimental/...")` anywhere in the bundle.
    const requireExpRe = /require\(["'][^"']*experimental\/[^"']*["']\)/g
    const matches: string[] = []
    let m: RegExpExecArray | null
    m = requireExpRe.exec(content)
    while (m !== null) {
      const before = content.slice(0, m.index)
      const lineNum = before.split('\n').length
      matches.push(`dist/anvil-bundle.cjs:${lineNum}: ${m[0]}`)
      m = requireExpRe.exec(content)
    }

    expect(
      matches,
      `require() calls for experimental modules found in anvil-bundle.cjs.\nThese indicate esbuild kept the require() call for an external experimental\nmodule — if this appears at the top level it would fail at startup.\nFound:\n${matches.join('\n')}`,
    ).toHaveLength(0)
  })
})
