import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface VersionSyncResult {
  packageVersion: string
  marketplaceVersion: string
  changelogVersion: string | null
  inSync: boolean
  mismatches: string[]
}

/**
 * Reads the top-most non-Unreleased version heading from CHANGELOG.md.
 * Returns null if no versioned heading is found or the file is unreadable.
 */
export function readChangelogTopVersion(changelogPath: string): string | null {
  let content: string
  try {
    content = readFileSync(changelogPath, 'utf-8')
  } catch {
    return null
  }
  const match = /^## \[(\d+\.\d+\.\d+)\]/m.exec(content)
  return match ? match[1] : null
}

/**
 * Checks whether package.json, marketplace.json, and CHANGELOG.md are all
 * stamped with the same version. Skips the CHANGELOG check when the package
 * version looks like a dev marker (e.g. "0.0.0-dev", "0.0.0").
 *
 * @param root - absolute path to the project root (where package.json lives)
 */
export function checkVersionSync(root: string): VersionSyncResult {
  const packageRaw = readFileSync(join(root, 'package.json'), 'utf-8')
  const marketplaceRaw = readFileSync(join(root, 'marketplace.json'), 'utf-8')

  const packageVersion = (JSON.parse(packageRaw) as { version: string }).version
  const marketplaceVersion = (JSON.parse(marketplaceRaw) as { version: string })
    .version

  const isDev =
    packageVersion === '0.0.0' || packageVersion.startsWith('0.0.0-')

  const changelogVersion = isDev
    ? null
    : readChangelogTopVersion(join(root, 'CHANGELOG.md'))

  const mismatches: string[] = []

  if (packageVersion !== marketplaceVersion) {
    mismatches.push(
      `package.json (${packageVersion}) ≠ marketplace.json (${marketplaceVersion})`,
    )
  }

  if (!isDev && changelogVersion !== null) {
    if (packageVersion !== changelogVersion) {
      mismatches.push(
        `package.json (${packageVersion}) ≠ CHANGELOG.md top entry (${changelogVersion})`,
      )
    }
  } else if (!isDev && changelogVersion === null) {
    mismatches.push('CHANGELOG.md has no versioned heading — half-ship guard')
  }

  return {
    packageVersion,
    marketplaceVersion,
    changelogVersion,
    inSync: mismatches.length === 0,
    mismatches,
  }
}
