/**
 * ANV-0137 — Templates category doctor checks.
 *
 * Two responsibilities:
 *
 *   1. Report which user-template overrides under `~/.anvil/templates/` are
 *      currently loaded. Info-class row; silent when the directory is empty.
 *      Renders as `templates/user-overrides-loaded`.
 *
 *   2. Lint skill bodies for embedded-template drift: a body that contains
 *      the `<!-- template-prose -->` marker but does NOT declare a
 *      `templates: [...]` frontmatter entry is flagged as a doctor warning.
 *      This nudges authors to migrate the prose into `templates/<kind>/`
 *      instead of letting it duplicate across skills.
 *
 * Both checks are read-only (no writes). The first one consults the user
 * filesystem via `listUserTemplateOverrides`; the second walks the
 * bundled `skills/` tree the same way every other content-lint check does.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bodyContainsEmbeddedTemplateMarker,
  listUserTemplateOverrides,
} from '../../../core/templates/index.js'
import { walkSlugFiles } from './architecture.js'

// Local mirror of the Check interface from doctor.ts — same shape, kept
// in sync with content.ts and the other doctor-checks/ files.
interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
  alwaysVisible?: boolean
}

const ROW_USER_OVERRIDES = 'templates/user-overrides-loaded'
const ROW_EMBEDDED_LINT = 'templates/embedded-prose-lint'
// ANV-0136 — info row listing skills that consume ${TEMPLATE:decisions}.
const ROW_DECISION_SKILLS = 'decision-template/skills-using-it'

/**
 * Pushes the `templates/user-overrides-loaded` row. Status:
 *   - pass + detail "none"          when no overrides are present
 *   - pass + detail "<n> override(s): kind/variant, …" when present
 *   - skip                          when `userRoot` is missing entirely
 *
 * Quiet-mode behaviour: marked `expectedAbsence: true` so the row is
 * suppressed when there are no overrides; users only see it when an
 * override is actually in effect (or with `--verbose`).
 */
export function pushTemplateUserOverridesCheck(
  checks: Check[],
  userRoot: string,
): void {
  if (!existsSync(userRoot)) {
    checks.push({
      name: ROW_USER_OVERRIDES,
      status: 'skip',
      detail: 'user root not present',
      expectedAbsence: true,
    })
    return
  }
  const overrides = listUserTemplateOverrides(userRoot)
  if (overrides.length === 0) {
    checks.push({
      name: ROW_USER_OVERRIDES,
      status: 'pass',
      detail: 'none',
      expectedAbsence: true,
    })
    return
  }
  const summary = overrides
    .map(({ kind, variant }) => `${kind}/${variant}`)
    .join(', ')
  checks.push({
    name: ROW_USER_OVERRIDES,
    status: 'pass',
    detail: `${overrides.length} override(s): ${summary}`,
  })
}

/**
 * Pushes the `templates/embedded-prose-lint` row. Walks every bundled
 * skill body, looking for the `<!-- template-prose -->` marker; when found
 * without a corresponding `templates:` frontmatter entry, warns the author
 * to migrate the embedded prose into a `templates/<kind>/` file.
 *
 * Pass: every skill that contains the marker also declares `templates:`.
 * Warn: at least one skill carries the marker but has no `templates:` field.
 *
 * The check is intentionally narrow: it ONLY fires on the explicit marker.
 * That keeps false positives near zero — authors must opt into the lint by
 * dropping a `<!-- template-prose -->` comment above the block they intend
 * to extract.
 */
export function pushTemplateEmbeddedLintCheck(
  checks: Check[],
  cwd: string,
  skillsRootOverride?: string,
): void {
  const skillsDir = skillsRootOverride ?? join(cwd, 'skills')
  if (!existsSync(skillsDir)) {
    checks.push({
      name: ROW_EMBEDDED_LINT,
      status: 'skip',
      detail: 'no skills/ directory',
      expectedAbsence: true,
    })
    return
  }
  const offenders: string[] = []
  for (const file of walkSlugFiles(skillsDir)) {
    let text: string
    try {
      text = readFileSync(file, 'utf-8')
    } catch {
      continue
    }
    if (!bodyContainsEmbeddedTemplateMarker(text)) continue
    // The marker is present. Check the frontmatter for `templates:`.
    // Cheap heuristic: look for a `templates:` YAML key in the leading
    // frontmatter block (between the first two `---` fences). We avoid
    // a full YAML parse because the doctor row should never fail a load
    // — it is purely a content lint.
    const fmMatch = text.match(/^---\n([\s\S]*?)\n---/)
    const fm = fmMatch ? fmMatch[1] : ''
    if (/^templates\s*:/m.test(fm)) continue
    offenders.push(file.replace(`${cwd}/`, ''))
  }
  if (offenders.length === 0) {
    checks.push({
      name: ROW_EMBEDDED_LINT,
      status: 'pass',
      detail:
        'no skills carry the embedded-template marker without a templates: field',
    })
    return
  }
  checks.push({
    name: ROW_EMBEDDED_LINT,
    status: 'warn',
    detail: `${offenders.length} skill(s) carry <!-- template-prose --> without a templates: frontmatter entry: ${offenders.join(', ')}`,
  })
}

/**
 * ANV-0136 — Pushes the `decision-template/skills-using-it` row. Info-class:
 * always renders pass, but lists which skills under `skills/` reference
 * `${TEMPLATE:decisions}` in their bodies. Silent when no skills consume the
 * template (info row with detail "none").
 *
 * Discovery is body-based (matches the actual reference token) rather than
 * frontmatter-based — a skill that declares `templates: [decisions]` but
 * never renders the token is not "using it" in any operational sense.
 *
 * Sorted output: caller-stable order means snapshot tests don't churn.
 */
export function pushDecisionTemplateSkillsCheck(
  checks: Check[],
  cwd: string,
): void {
  const skillsDir = join(cwd, 'skills')
  if (!existsSync(skillsDir)) {
    checks.push({
      name: ROW_DECISION_SKILLS,
      status: 'skip',
      detail: 'no skills/ directory',
      expectedAbsence: true,
    })
    return
  }
  const consumers: string[] = []
  for (const file of walkSlugFiles(skillsDir)) {
    let text: string
    try {
      text = readFileSync(file, 'utf-8')
    } catch {
      continue
    }
    if (!text.includes('${TEMPLATE:decisions}')) continue
    consumers.push(file.replace(`${cwd}/`, ''))
  }
  if (consumers.length === 0) {
    checks.push({
      name: ROW_DECISION_SKILLS,
      status: 'pass',
      detail: 'none',
      expectedAbsence: true,
    })
    return
  }
  consumers.sort()
  checks.push({
    name: ROW_DECISION_SKILLS,
    status: 'pass',
    detail: `${consumers.length} skill(s): ${consumers.join(', ')}`,
  })
}
