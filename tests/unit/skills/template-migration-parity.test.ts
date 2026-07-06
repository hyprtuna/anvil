/**
 * ANV-0137 — Golden-file parity for the 5 skills migrated to template references.
 *
 * Each migrated skill body should, after \${TEMPLATE:<kind>} substitution, still
 * contain the key prose anchors that lived in the embedded block before
 * migration. The full template file is also asserted to be present byte-for-byte
 * inside the rendered output (modulo surrounding skill prose).
 *
 * This guards against accidental template-content drift: editing the bundled
 * `templates/<kind>/default.md` in a way that breaks the embedded contract
 * would fail this test.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderSkillBody } from '../../../src/skills/body.js'
import { loadSkillFile } from '../../../src/skills/loader.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..')
const SKILLS_DIR = join(REPO_ROOT, 'skills', 'universal')
const TEMPLATES_DIR = join(REPO_ROOT, 'templates')

// ANV-0083: some skills (brainstorm-spec, code-review, plan-verification) moved
// to subdir form to colocate Task(general-purpose) prompt bodies. Resolve the
// skill path by preferring the flat form when present; otherwise fall back to
// `<slug>/SKILL.md` — mirrors the loader's behavior.
import { existsSync } from 'node:fs'

function resolveSkillPath(slug: string): string {
  const flat = join(SKILLS_DIR, `${slug}.md`)
  if (existsSync(flat)) return flat
  return join(SKILLS_DIR, slug, 'SKILL.md')
}

async function render(slug: string): Promise<string> {
  const skill = await loadSkillFile(resolveSkillPath(slug))
  return renderSkillBody(skill, {
    anvilRoot: REPO_ROOT,
    projectRoot: REPO_ROOT,
    scope: 'project',
  })
}

function readTemplate(kind: string): string {
  return readFileSync(join(TEMPLATES_DIR, kind, 'default.md'), 'utf-8')
}

describe('migrated-skill golden parity', () => {
  it('architecture-decision-record renders the tickets template inline', async () => {
    const rendered = await render('architecture-decision-record')
    const template = readTemplate('tickets')
    expect(rendered).toContain(template)
    // Anchor: the ADR header line lived in the embedded prose pre-migration.
    expect(rendered).toContain('# ADR-NNNN: [Decision Title]')
    expect(rendered).toContain('## Context')
    expect(rendered).toContain('## Decision')
    expect(rendered).toContain('## Alternatives Considered')
    expect(rendered).toContain('## Consequences')
    // Frontmatter declared the kind.
    expect(
      (await loadSkillFile(join(SKILLS_DIR, 'architecture-decision-record.md')))
        .frontmatter.templates,
    ).toContain('tickets')
  })

  it('code-review renders the code-review template inline', async () => {
    const rendered = await render('code-review')
    expect(rendered).toContain(readTemplate('code-review'))
    expect(rendered).toContain('## Severity Taxonomy')
    expect(rendered).toContain('**`CRITICAL`**')
    expect(rendered).toContain('## Findings Structure')
    expect(rendered).toContain('### Assessment')
    expect(rendered).toContain('Ready to merge: Yes | With fixes | No')
    expect(
      (await loadSkillFile(resolveSkillPath('code-review'))).frontmatter
        .templates,
    ).toContain('code-review')
  })

  it('changelog-generation renders the changelogs template inline', async () => {
    const rendered = await render('changelog-generation')
    expect(rendered).toContain(readTemplate('changelogs'))
    expect(rendered).toContain('| Prefix | Section |')
    expect(rendered).toContain('### Breaking Changes')
    expect(rendered).toContain(
      'Updates `@anthropic/sdk` to address CVE-2025-XXXX.',
    )
    expect(
      (await loadSkillFile(join(SKILLS_DIR, 'changelog-generation.md')))
        .frontmatter.templates,
    ).toContain('changelogs')
  })

  it('plan-writing renders the plans template inline', async () => {
    const rendered = await render('plan-writing')
    expect(rendered).toContain(readTemplate('plans'))
    expect(rendered).toContain('plan: <sequential number>')
    expect(rendered).toContain('### Task 1:')
    expect(rendered).toContain('### Required header fields')
    expect(
      (await loadSkillFile(join(SKILLS_DIR, 'plan-writing', 'SKILL.md')))
        .frontmatter.templates,
    ).toContain('plans')
  })

  it('brainstorm-spec renders the specs template inline; decisions grammar lives in addendum', async () => {
    // ANV-0192: brainstorm-spec migrated to the user-choice pattern. The
    // body keeps the generic specs template (always relevant) and moves
    // the Anvil-specific D-NN decision grammar to anvil-addendum.md, where
    // it's loaded only when the user picks the Anvil flavor.
    const rendered = await render('brainstorm-spec')
    expect(rendered).toContain(readTemplate('specs'))
    // Spec-template anchors (body, universal).
    expect(rendered).toContain('spec: <slug>')
    expect(rendered).toContain('## Acceptance Criteria')
    expect(rendered).toContain('## Open Questions')

    // Decision grammar moved to addendum (loaded on Anvil-flavor opt-in).
    const addendum = readFileSync(
      join(SKILLS_DIR, 'brainstorm-spec', 'anvil-addendum.md'),
      'utf-8',
    )
    expect(addendum).toMatch(/D-\d\d:/)
    expect(addendum).toContain('<decisions>')

    const fm = (await loadSkillFile(resolveSkillPath('brainstorm-spec')))
      .frontmatter
    expect(fm.templates).toContain('specs')
  })
})
