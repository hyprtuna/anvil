import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSlateSections } from './parse-slate-sections.js'
import type { SemverVersion } from './types.js'

/**
 * Prepend a new CHANGELOG entry for `version` above the current top entry.
 *
 * The entry body is built from the slate doc's `### Added / Improved /
 * Changed / Fixed` sections (best-effort; operator polishes before commit).
 *
 * The CHANGELOG heading format follows the existing convention:
 *   `## [<version>] — <isoDate>`
 *
 * @param root      - absolute path to the project root
 * @param version   - new release version
 * @param isoDate   - ISO 8601 date string (e.g. "2026-05-14")
 * @param slatePath - absolute path to the release slate markdown file
 */
export function prependChangelog(
  root: string,
  version: SemverVersion,
  isoDate: string,
  slatePath: string,
): void {
  const changelogPath = join(root, 'CHANGELOG.md')
  const changelogRaw = readFileSync(changelogPath, 'utf-8')
  const slateRaw = readFileSync(slatePath, 'utf-8')

  const sections = parseSlateSections(slateRaw)

  const bodyLines: string[] = []

  // Build section blocks from parsed slate content.
  const sectionOrder = [
    ['added', '### Added'],
    ['improved', '### Improved'],
    ['changed', '### Changed'],
    ['fixed', '### Fixed'],
    ['deferred', '### Deferred'],
  ] as const

  for (const [key, heading] of sectionOrder) {
    const content = sections[key]
    if (content) {
      bodyLines.push(heading)
      bodyLines.push('')
      bodyLines.push(content)
      bodyLines.push('')
    }
  }

  // If we got no sections, leave a placeholder so the operator can fill in.
  if (bodyLines.length === 0) {
    bodyLines.push(
      '_TODO: fill in release notes from the slate doc before committing._',
    )
    bodyLines.push('')
  }

  const entry = [`## [${version}] — ${isoDate}`, '', ...bodyLines].join('\n')

  // Insert the new entry after the first `# Changelog` heading line
  // (and its optional blank lines), directly before the first existing `## [` entry.
  const firstEntryMatch = /^## \[/m.exec(changelogRaw)
  if (!firstEntryMatch) {
    // No existing versioned entry — append after the header block.
    const updated = `${changelogRaw.trimEnd()}\n\n${entry}\n`
    writeFileSync(changelogPath, updated, 'utf-8')
    return
  }

  const insertAt = firstEntryMatch.index
  const updated = `${changelogRaw.slice(0, insertAt)}${entry}\n${changelogRaw.slice(insertAt)}`
  writeFileSync(changelogPath, updated, 'utf-8')
}
