/**
 * ANV-0027 — Three-tier collision *detector*. Pure; no I/O; no resolution.
 *
 * Tiers:
 *   1. extension slug matches an already-installed extension's name.
 *   2. any `provides` slug shadows a bundled core slug (per kind).
 *   3. any `provides` slug collides with another installed extension's
 *      `provides` slug (per kind).
 */

import type {
  Collision,
  CollisionContext,
  ExtensionManifest,
  ExtensionProvides,
  ExtensionResourceKind,
} from './types.js'

const KINDS: readonly ExtensionResourceKind[] = [
  'skill',
  'agent',
  'hook',
  'command',
]

function slugsForKind(
  provides: ExtensionProvides,
  kind: ExtensionResourceKind,
): readonly string[] {
  return provides[kind] ?? []
}

export function detectCollisions(
  manifest: ExtensionManifest,
  ctx: CollisionContext,
): Collision[] {
  const collisions: Collision[] = []

  // Tier 1 — name collision against installed extensions.
  for (const installed of ctx.installed) {
    if (installed.name === manifest.name) {
      collisions.push({
        tier: 1,
        kind: 'extension',
        slug: manifest.name,
        conflictingSource: `installed extension '${installed.name}'`,
      })
    }
  }

  // Tier 2 — provided slug shadows a bundled core slug (per kind).
  for (const kind of KINDS) {
    const bundled = ctx.bundled[kind]
    for (const slug of slugsForKind(manifest.provides, kind)) {
      if (bundled.has(slug)) {
        collisions.push({
          tier: 2,
          kind,
          slug,
          conflictingSource: `bundled ${kind} '${slug}'`,
        })
      }
    }
  }

  // Tier 3 — provided slug collides with another installed extension.
  for (const kind of KINDS) {
    for (const slug of slugsForKind(manifest.provides, kind)) {
      for (const installed of ctx.installed) {
        const installedSlugs = slugsForKind(installed.provides, kind)
        if (installedSlugs.includes(slug)) {
          collisions.push({
            tier: 3,
            kind,
            slug,
            conflictingSource: `extension '${installed.name}' also provides ${kind} '${slug}'`,
          })
        }
      }
    }
  }

  return collisions
}
