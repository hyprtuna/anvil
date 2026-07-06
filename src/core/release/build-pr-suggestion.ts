import type { SlateSections } from './parse-slate-sections.js'
import type { SemverVersion } from './types.js'

export interface PrSuggestion {
  title: string
  body: string
}

/**
 * Build a suggested PR title and body for the release commit.
 *
 * The title follows the conventional format used in Anvil releases.
 * The body is a markdown string suitable for a GitHub/GitLab PR description.
 *
 * @param from     - previous version
 * @param to       - new version
 * @param sections - parsed sections from the release slate
 */
export function buildPrSuggestion(
  from: SemverVersion,
  to: SemverVersion,
  sections: SlateSections,
): PrSuggestion {
  const title = `chore(release): v${to}`

  const bodyParts: string[] = [`## Release v${to}`, '']

  const sectionOrder = [
    ['added', 'Added'],
    ['improved', 'Improved'],
    ['changed', 'Changed'],
    ['fixed', 'Fixed'],
    ['deferred', 'Deferred'],
  ] as const

  let hasSections = false
  for (const [key, label] of sectionOrder) {
    const content = sections[key]
    if (content) {
      bodyParts.push(`### ${label}`, '')
      bodyParts.push(content, '')
      hasSections = true
    }
  }

  if (!hasSections) {
    bodyParts.push(
      '_No slate sections found — fill in release notes manually._',
      '',
    )
  }

  bodyParts.push(
    '---',
    '',
    `Bumps \`${from}\` → \`${to}\`. See \`docs/anvil/releases/v${to}.md\` for the full slate.`,
    '',
    'After merging:',
    '```',
    `git tag v${to}`,
    `git push origin v${to}`,
    '```',
  )

  return {
    title,
    body: bodyParts.join('\n'),
  }
}
