import type { SemverVersion } from './types.js'

/**
 * Split a semver string into [major, minor, patch] integers.
 * Caller is responsible for ensuring the input is a valid SemverVersion.
 */
function parts(v: SemverVersion): [number, number, number] {
  const [major, minor, patch] = v.split('.').map(Number)
  return [major ?? 0, minor ?? 0, patch ?? 0]
}

/**
 * Compare two SemVer strings.
 *
 * Returns:
 *  -1  when a < b
 *   0  when a === b
 *   1  when a > b
 */
export function compareSemver(a: SemverVersion, b: SemverVersion): -1 | 0 | 1 {
  const [aMaj, aMin, aPat] = parts(a)
  const [bMaj, bMin, bPat] = parts(b)

  if (aMaj !== bMaj) return aMaj < bMaj ? -1 : 1
  if (aMin !== bMin) return aMin < bMin ? -1 : 1
  if (aPat !== bPat) return aPat < bPat ? -1 : 1
  return 0
}

/**
 * Return the version one patch below `v`.
 * e.g. "1.2.3" → "1.2.2", "1.2.0" → "1.1.999" is NOT produced —
 * minor and major are left unchanged; patch just decrements by 1.
 * Returns null when patch is already 0 (cannot decrement below 0).
 */
export function bumpDown(v: SemverVersion): SemverVersion | null {
  const [major, minor, patch] = parts(v)
  if (patch === 0) return null
  return `${major}.${minor}.${patch - 1}` as SemverVersion
}
