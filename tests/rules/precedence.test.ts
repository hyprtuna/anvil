import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../src/core/config/defaults.js'
import { rulesInjectorHandler } from '../../src/hooks/handlers/rules-injector.js'
import { rulesPromptInjectorUserPromptSubmit } from '../../src/hooks/handlers/rules-prompt-injector.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

function mkTmp(): string {
  const t = createTestTmpDir('precedence')
  return t
}

describe('rules / 4-layer precedence', () => {
  it('workflow rule from nearest AGENTS.md wins over a root-level CLAUDE.md for a file edit', async () => {
    const root = mkTmp()
    mkdirSync(join(root, 'src', 'sub'), { recursive: true })
    writeFileSync(
      join(root, 'CLAUDE.md'),
      '# Project-wide rule\n\nNever use `any` outside src/legacy/.\n',
    )
    writeFileSync(
      join(root, 'src', 'sub', 'AGENTS.md'),
      '# Sub-tree override\n\nPrefer `unknown` over `any`; narrow at boundaries.\n',
    )

    const result = await rulesInjectorHandler({
      kind: 'pre-tool-use',
      cwd: root,
      config: buildDefaultConfig(),
      env: {},
      payload: { file: join(root, 'src', 'sub', 'feature.ts') },
    })
    expect(result.exitCode).toBe(0)
    const ctxOut = result.context as {
      rulesFile?: string
      rules?: string
    }
    // Nearest wins: the sub-tree AGENTS.md, not the root CLAUDE.md.
    expect(ctxOut.rulesFile ?? '').toContain('src/sub/AGENTS.md')
    expect(ctxOut.rules ?? '').toContain('unknown')
  })

  it('prompt-rule banner is emitted independently of workflow rules (co-existence, not collision)', async () => {
    const root = mkTmp()
    const rulesDir = join(root, '.claude', 'skills', 'universal', 'rules')
    mkdirSync(rulesDir, { recursive: true })
    writeFileSync(
      join(rulesDir, 'verification-before-completion.md'),
      '---\nname: verification-before-completion\nkind: meta\n---\n\nbody\n',
    )

    // Also add a workflow-layer AGENTS.md so both layers are live.
    writeFileSync(join(root, 'AGENTS.md'), '# workflow rule\n')

    const prompt = await rulesPromptInjectorUserPromptSubmit({
      kind: 'user-prompt-submit',
      cwd: root,
      config: buildDefaultConfig(),
      env: {},
      payload: 'anything',
    })
    expect(prompt.exitCode).toBe(0)
    const banner = (prompt.context as { rulesPromptBanner?: string })
      .rulesPromptBanner
    expect(banner).toContain('verification-before-completion')

    const workflow = await rulesInjectorHandler({
      kind: 'pre-tool-use',
      cwd: root,
      config: buildDefaultConfig(),
      env: {},
      payload: { file: join(root, 'foo.ts') },
    })
    const wfCtx = workflow.context as {
      rulesFile?: string
      rules?: string
    }
    expect(wfCtx.rules ?? '').toContain('workflow rule')

    // The two layers produce independent context payloads (prompt banner vs
    // rules body) — they co-exist and never collide on a single key.
    expect(banner).not.toContain('workflow rule')
    expect(wfCtx.rules ?? '').not.toContain('verification-before-completion')
  })

  it('deterministic choice when two rule files live in the same directory: AGENTS.md wins over CLAUDE.md', async () => {
    const root = mkTmp()
    writeFileSync(join(root, 'AGENTS.md'), '# agents\n')
    writeFileSync(join(root, 'CLAUDE.md'), '# claude\n')

    const result = await rulesInjectorHandler({
      kind: 'pre-tool-use',
      cwd: root,
      config: buildDefaultConfig(),
      env: {},
      payload: { file: join(root, 'file.ts') },
    })
    const ctxOut = result.context as { rulesFile?: string }
    expect(ctxOut.rulesFile ?? '').toContain('AGENTS.md')
    expect(ctxOut.rulesFile ?? '').not.toContain('CLAUDE.md')
  })
})
