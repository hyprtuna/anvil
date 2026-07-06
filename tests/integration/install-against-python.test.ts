import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { detectProject } from '../../src/core/project/detect.js'
import { runInstaller } from '../../src/installer/install.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = join(__dirname, '..', 'fixtures', 'python-project')

describe('integration: install against Python fixture', () => {
  it('detects Python + FastAPI and installs', async () => {
    const tmp = createTestTmpDir('py')
    cpSync(fixture, tmp, { recursive: true })

    const project = await detectProject(tmp)
    expect(project.languages.some((l) => l.name === 'python')).toBe(true)
    expect(project.frameworks).toContain('fastapi')

    await runInstaller({
      target: 'claude-code',
      scope: 'project',
      preset: 'balanced',
      cwd: tmp,
    })
    expect(existsSync(join(tmp, 'skills', 'fastapi-coding', 'SKILL.md'))).toBe(
      true,
    )

    rmSync(tmp, { recursive: true })
  })
})
