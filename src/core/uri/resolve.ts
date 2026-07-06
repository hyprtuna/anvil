import { existsSync, realpathSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve as resolvePath, sep } from 'node:path'
import { BUNDLED_PACK, filesystemMap } from './filesystem-map.js'
import { canonicalise } from './format.js'
import { parseGrammar } from './grammar.js'
import type {
  AnvilUriError,
  AnvilUriErrorCode,
  ParsedUri,
  ResolveContext,
  ResolveResult,
  ResourceKind,
  ResourceRef,
} from './types.js'

// ---------------------------------------------------------------------------
// ANV-0095 — anvil: URI resolver
// Orchestrates: parse → infer kind → map to candidate paths → check existence
// → traversal guard → return ResourceRef.
//
// Filesystem touchpoints: existsSync, readdirSync (for ticket glob), and
// realpathSync (symlink hardening). All errors are returned, never thrown.
// ---------------------------------------------------------------------------

/**
 * Resolve an `anvil:` URI to a `ResourceRef`. Errors are returned in the
 * `{ ok: false, error }` branch — this function never throws.
 */
export function resolveAnvilUri(
  uri: string,
  ctx: ResolveContext,
): ResolveResult {
  if (typeof uri !== 'string' || !uri.startsWith('anvil:')) {
    return err('NOT_ANVIL_URI', uri, `not an anvil: URI: ${uri}`)
  }

  const parsed = parseGrammar(uri)
  if (parsed === null) {
    return err(
      'MALFORMED',
      uri,
      `malformed anvil: URI: ${uri} (expected anvil:[<pack>:]<kind>/<slug>[/<version>][#<fragment>])`,
    )
  }

  const kind: ResourceKind | undefined = parsed.kind ?? ctx.inferredKind
  if (!kind) {
    return err(
      'AMBIGUOUS_KIND',
      uri,
      `cannot infer kind from '${uri}' — pass full form anvil:<kind>/<slug> or supply invocation context`,
    )
  }

  const parsedWithKind: ParsedUri & { kind: ResourceKind } = { ...parsed, kind }
  const candidates = filesystemMap(parsedWithKind, ctx.roots)
  if (candidates.length === 0) {
    // E.g. pack-shipped hook/command/slash — reserved per RFC §3.2.
    return err(
      'NOT_FOUND',
      uri,
      `anvil:${parsed.pack ?? ''}${parsed.pack ? ':' : ''}${kind}/${parsed.slug} not found (no candidate paths for kind '${kind}' under pack '${parsed.pack ?? BUNDLED_PACK}')`,
    )
  }

  const tried: string[] = []
  for (const cand of candidates) {
    tried.push(cand.path)
    const matched = cand.glob
      ? matchGlob(cand.path)
      : existsSync(cand.path)
        ? cand.path
        : null
    if (matched === null) continue

    // Path-traversal guard: resolved real path must remain under root.
    const guardResult = traversalGuard(matched, cand.root)
    if (!guardResult.ok) {
      return err(
        'PATH_TRAVERSAL',
        uri,
        `refused: ${uri} resolves outside permitted root (${cand.root})`,
      )
    }

    const pack = parsed.pack ?? BUNDLED_PACK
    const ref: ResourceRef = {
      uri: '', // filled in below
      kind,
      slug: parsed.slug,
      pack,
      fsPath: guardResult.absPath,
    }
    if (parsed.version !== undefined) ref.version = parsed.version
    if (parsed.fragment !== undefined) ref.fragment = parsed.fragment
    ref.uri = canonicalise(ref)
    return { ok: true, ref }
  }

  return err(
    'NOT_FOUND',
    uri,
    `anvil:${kind}/${parsed.slug} not found (looked in: ${tried.join(', ')})`,
  )
}

/**
 * Path-traversal + symlink guard. The candidate path is resolved to its
 * absolute form (and through any symlinks) and must still live under `root`.
 *
 * Returns the verified absolute path or `{ ok: false }` if the guard fails.
 */
function traversalGuard(
  candidatePath: string,
  root: string,
): { ok: true; absPath: string } | { ok: false } {
  const absRootBase = isAbsolute(root) ? root : resolvePath(root)
  const absCandidate = isAbsolute(candidatePath)
    ? candidatePath
    : resolvePath(candidatePath)
  let real: string
  let realRoot: string
  try {
    real = realpathSync(absCandidate)
    realRoot = realpathSync(absRootBase)
  } catch {
    return { ok: false }
  }
  const rootWithSep = realRoot.endsWith(sep) ? realRoot : realRoot + sep
  if (real !== realRoot && !real.startsWith(rootWithSep)) {
    return { ok: false }
  }
  return { ok: true, absPath: real }
}

/**
 * Match a glob pattern of the form `<dir>/<prefix>*<suffix>` — used only for
 * ticket file lookups. Returns the first matching path (alphabetical) or null.
 * This is a tiny single-asterisk matcher to avoid a dependency.
 */
function matchGlob(pattern: string): string | null {
  const dir = dirname(pattern)
  const base = pattern.slice(dir.length + 1)
  const starIdx = base.indexOf('*')
  if (starIdx < 0) {
    return existsSync(pattern) ? pattern : null
  }
  const prefix = base.slice(0, starIdx)
  const suffix = base.slice(starIdx + 1)
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return null
  }
  const matches = entries
    .filter((e) => e.startsWith(prefix) && e.endsWith(suffix))
    .sort()
  if (matches.length === 0) return null
  return `${dir}${sep}${matches[0]}`
}

function err(
  code: AnvilUriErrorCode,
  uri: string,
  message: string,
): ResolveResult {
  const error: AnvilUriError = { code, uri, message }
  return { ok: false, error }
}
