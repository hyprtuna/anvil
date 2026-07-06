import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const binPath = join(__dirname, '..', '..', 'bin', 'anvil.cjs')

const COMMANDS = [
  'init',
  'doctor',
  'upgrade',
  'uninstall',
  'models',
  'models list',
  'models show',
  'skill',
  'skill list',
  'skill create',
  'skill run',
  'skill select',
  'plan',
  'review',
  'debug',
  'tdd',
  'ultra',
  'explore',
  'pr',
  'agents',
]

describe('integration: anvil --help surfaces', () => {
  for (const cmd of COMMANDS) {
    it(`anvil ${cmd} --help renders`, () => {
      const output = execSync(`node ${binPath} ${cmd} --help`, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      expect(output.length).toBeGreaterThan(10)
      expect(output.toLowerCase()).toContain('usage')
    })
  }
})
