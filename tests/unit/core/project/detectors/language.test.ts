import { join } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { detectLanguages } from '../../../../../src/core/project/detectors/language.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'fixtures',
  'detect-ts-project',
)

describe('core/project/detectors/language', () => {
  it('detects TypeScript from tsconfig.json', async () => {
    const results = await detectLanguages(fixture)
    const ts = results.find((r) => r.name === 'typescript')
    expect(ts).toBeDefined()
    expect(ts!.confidence).toBeGreaterThan(0.5)
    expect(ts!.evidence).toContain('tsconfig.json')
  })

  it('returns results from a real project directory', async () => {
    const results = await detectLanguages(fixture)
    expect(results.length).toBeGreaterThan(0)
  })
})
