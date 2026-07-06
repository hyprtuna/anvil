import { join } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { detectProject } from '../../../../src/core/project/detect.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = join(
  __dirname,
  '..',
  '..',
  '..',
  'fixtures',
  'detect-ts-project',
)

describe('core/project/detect', () => {
  it('returns a valid ProjectContext', async () => {
    const ctx = await detectProject(fixture)
    expect(ctx.languages.length).toBeGreaterThan(0)
    expect(ctx.detectedAt).toBeDefined()
  })

  it('detects TypeScript in the fixture', async () => {
    const ctx = await detectProject(fixture)
    const ts = ctx.languages.find((l) => l.name === 'typescript')
    expect(ts).toBeDefined()
    expect(ts!.confidence).toBeGreaterThan(0.5)
  })

  it('detects next.js framework in the fixture', async () => {
    const ctx = await detectProject(fixture)
    expect(ctx.frameworks).toContain('next.js')
  })

  it('completes within 2 seconds', async () => {
    const start = Date.now()
    await detectProject(fixture)
    expect(Date.now() - start).toBeLessThan(2000)
  })
})
