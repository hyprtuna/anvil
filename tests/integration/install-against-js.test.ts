import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { detectProject } from '../../src/core/project/detect.js'
import { runInstaller } from '../../src/installer/install.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = join(__dirname, '..', 'fixtures', 'js-project')

describe('integration: install against JS/TS fixture', () => {
  it('detects TypeScript + Next.js and installs', async () => {
    const tmp = createTestTmpDir('js')
    cpSync(fixture, tmp, { recursive: true })

    const project = await detectProject(tmp)
    expect(project.languages.some((l) => l.name === 'typescript')).toBe(true)
    expect(project.frameworks).toContain('next.js')

    await runInstaller({
      target: 'both',
      scope: 'project',
      preset: 'balanced',
      cwd: tmp,
    })
    expect(existsSync(join(tmp, '.claude-plugin', 'plugin.json'))).toBe(true)
    expect(existsSync(join(tmp, 'plugins', 'opencode', 'package.json'))).toBe(
      true,
    )

    rmSync(tmp, { recursive: true })
  })

  it('ships TypeScript overlay skill typescript-typing when TS detected', async () => {
    const tmp = createTestTmpDir('js2')
    cpSync(fixture, tmp, { recursive: true })
    await runInstaller({
      target: 'claude-code',
      scope: 'project',
      preset: 'balanced',
      cwd: tmp,
    })
    expect(
      existsSync(join(tmp, 'skills', 'typescript-typing', 'SKILL.md')),
    ).toBe(true)
    rmSync(tmp, { recursive: true })
  })
})
