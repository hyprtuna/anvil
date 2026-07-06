import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..', '..')
const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'))
const binPath = join(projectRoot, 'bin', 'anvil.cjs')

describe('anvil CLI smoke tests', () => {
  it('prints the package version when invoked with --version', () => {
    const output = execSync(`node ${binPath} --version`, {
      encoding: 'utf-8',
    }).trim()
    expect(output).toBe(pkg.version)
  })

  it('prints help when invoked with --help', () => {
    const output = execSync(`node ${binPath} --help`, { encoding: 'utf-8' })
    expect(output).toContain('anvil')
    expect(output).toContain('Usage')
  })
})
