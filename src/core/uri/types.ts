import { z } from 'zod'

// ---------------------------------------------------------------------------
// ANV-0095 — anvil: URI resolver types
// Layer 0 — pure Zod schemas + interfaces, no I/O.
// ---------------------------------------------------------------------------

/** The 7 resource kinds addressable via the anvil: URI scheme. */
export const ResourceKind = z.enum([
  'skill',
  'agent',
  'hook',
  'command',
  'slash',
  'plan',
  'ticket',
])
export type ResourceKind = z.infer<typeof ResourceKind>

/**
 * Parsed shape of an `anvil:` URI before filesystem resolution.
 * `kind` is optional to allow the shorthand form (`anvil:<slug>`) where
 * an invocation context infers the kind.
 */
export interface ParsedUri {
  pack?: string
  kind?: ResourceKind
  slug: string
  version?: string
  fragment?: string
}

/** Result of a successful URI resolution. */
export interface ResourceRef {
  /** The original input, canonicalised (see format.ts:canonicalise). */
  uri: string
  kind: ResourceKind
  slug: string
  /** `'anvil'` for bundled, otherwise the named pack. */
  pack: string
  /** Semver-shaped version segment, only set for `plan` kind today. */
  version?: string
  /** Opaque fragment; the resolver never interprets it. */
  fragment?: string
  /** Absolute path on disk to the resource backing file. */
  fsPath: string
}

/** Error codes per RFC §4. */
export const AnvilUriErrorCode = z.enum([
  'NOT_ANVIL_URI',
  'MALFORMED',
  'UNKNOWN_KIND',
  'AMBIGUOUS_KIND',
  'NOT_FOUND',
  'AMBIGUOUS_PACK',
  'PATH_TRAVERSAL',
  'INVALID_VERSION',
])
export type AnvilUriErrorCode = z.infer<typeof AnvilUriErrorCode>

export interface AnvilUriError {
  code: AnvilUriErrorCode
  message: string
  uri: string
}

/**
 * Filesystem roots needed by the resolver. The caller supplies these so the
 * resolver remains a pure function of its inputs (tests pass tmp dirs).
 */
export interface ResolveRoots {
  /** The repo being worked on (used for plan + ticket kinds). */
  projectRoot: string
  /** `~/.anvil/`. */
  homeRoot: string
  /** The Anvil install prefix (where bundled skills/agents/hooks live). */
  bundledRoot: string
  /** `~/.anvil/packs/`. */
  packsRoot: string
}

/** Resolver invocation context. */
export interface ResolveContext {
  roots: ResolveRoots
  /** Inferred kind when input is shorthand form (`anvil:<slug>`). */
  inferredKind?: ResourceKind
}

/** Discriminated-union result type for the resolver. */
export type ResolveResult =
  | { ok: true; ref: ResourceRef }
  | { ok: false; error: AnvilUriError }
