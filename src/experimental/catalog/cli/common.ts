/**
 * ANV-0028 (P4) — Shared helpers for `anvil catalog` CLI commands.
 *
 * Layer 4 — commands leaf.
 * Imports from: node:os, node:path, layer 0 (core/catalog/).
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

// ─── Anvil home resolution ────────────────────────────────────────────────────

/**
 * Resolve the Anvil home directory.
 * Prefers ANVIL_HOME env var; falls back to ~/.anvil.
 */
export function resolveAnvilHome(): string {
  return process.env.ANVIL_HOME ?? join(homedir(), '.anvil')
}

// ─── source:slug parsing ─────────────────────────────────────────────────────

export type SourceSlug = {
  sourceId: string
  slug: string
}

/**
 * Parse a `<source>:<slug>` argument.
 *
 * Returns null when the format is not `<source>:<slug>` (missing colon, empty
 * sourceId, or empty slug).
 */
export function parseSourceSlug(arg: string): SourceSlug | null {
  const colonIndex = arg.indexOf(':')
  if (colonIndex < 1) return null
  const sourceId = arg.slice(0, colonIndex).trim()
  const slug = arg.slice(colonIndex + 1).trim()
  if (sourceId.length === 0 || slug.length === 0) return null
  return { sourceId, slug }
}

// ─── JSON output writer ───────────────────────────────────────────────────────

/**
 * Write a JSON payload to stdout with a trailing newline.
 */
export function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

// ─── Exit code constants (per plan §6 exit code table) ────────────────────────

export const EXIT_OK = 0
export const EXIT_INVALID_INPUT = 1
export const EXIT_NETWORK_FAILURE = 2
export const EXIT_VALIDATION_BLOCKED = 3
export const EXIT_OFFLINE = 4
export const EXIT_DUPLICATE_QUARANTINE = 5
