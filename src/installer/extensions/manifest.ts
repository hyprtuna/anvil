/**
 * ANV-0027 — Manifest parsing. Pure; never throws.
 */

import { ExtensionManifest } from './types.js'
import type { ManifestError, Result } from './types.js'

export function parseManifest(
  input: unknown,
): Result<ExtensionManifest, ManifestError> {
  const parsed = ExtensionManifest.safeParse(input)
  if (parsed.success) {
    return { ok: true, value: parsed.data }
  }
  const issues = parsed.error.issues.map((i) => ({
    path: i.path.join('.'),
    message: i.message,
  }))
  return {
    ok: false,
    error: {
      code: 'INVALID_MANIFEST',
      message: `extension manifest failed validation: ${issues
        .map((i) => `${i.path || '<root>'}: ${i.message}`)
        .join('; ')}`,
      issues,
    },
  }
}
