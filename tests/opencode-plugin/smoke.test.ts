import { describe, expect, it } from 'vitest'
import AnvilPlugin from '../../src/opencode-plugin/index.js'

describe('AnvilPlugin', () => {
  it('registers a skills path', async () => {
    const plugin = await AnvilPlugin()
    const config: { skills?: { paths?: string[] } } = {}
    await plugin.config(config)
    expect(config.skills?.paths?.length).toBeGreaterThan(0)
    expect(config.skills?.paths?.[0]).toMatch(/skills$/)
  })
  it('is idempotent on the skills path', async () => {
    const plugin = await AnvilPlugin()
    const config: { skills?: { paths?: string[] } } = { skills: { paths: [] } }
    await plugin.config(config)
    await plugin.config(config)
    expect(config.skills?.paths?.length).toBe(1)
  })
})
