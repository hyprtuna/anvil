/**
 * Tests for buildSafeEnv() — env allowlist that prevents forwarding secrets to
 * spawned hook child processes (Bundle B security fix).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildSafeEnv } from '../../../src/opencode-plugin/hooks/payload.js'

describe('buildSafeEnv()', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Clone so we can mutate without affecting other tests
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('does NOT forward common secret-shaped vars', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    process.env.AWS_SECRET_ACCESS_KEY = 'aws-secret-test'
    process.env.OPENAI_API_KEY = 'sk-openai-test'
    process.env.GITHUB_TOKEN = 'ghp_test'
    process.env.DATABASE_URL = 'postgres://user:pass@host/db'

    const safe = buildSafeEnv()

    expect(safe).not.toHaveProperty('ANTHROPIC_API_KEY')
    expect(safe).not.toHaveProperty('AWS_SECRET_ACCESS_KEY')
    expect(safe).not.toHaveProperty('OPENAI_API_KEY')
    expect(safe).not.toHaveProperty('GITHUB_TOKEN')
    expect(safe).not.toHaveProperty('DATABASE_URL')
  })

  it('does NOT forward NODE_OPTIONS (injection vector)', () => {
    process.env.NODE_OPTIONS = '--require /evil/script.js'

    const safe = buildSafeEnv()

    expect(safe).not.toHaveProperty('NODE_OPTIONS')
  })

  it('forwards PATH, HOME, USER, LANG, TZ, TMPDIR', () => {
    process.env.PATH = '/usr/bin:/bin'
    process.env.HOME = '/home/user'
    process.env.USER = 'testuser'
    process.env.LANG = 'en_US.UTF-8'
    process.env.TZ = 'UTC'
    process.env.TMPDIR = '/tmp'

    const safe = buildSafeEnv()

    expect(safe.PATH).toBe('/usr/bin:/bin')
    expect(safe.HOME).toBe('/home/user')
    expect(safe.USER).toBe('testuser')
    expect(safe.LANG).toBe('en_US.UTF-8')
    expect(safe.TZ).toBe('UTC')
    expect(safe.TMPDIR).toBe('/tmp')
  })

  it('forwards LC_* locale vars', () => {
    process.env.LC_ALL = 'en_US.UTF-8'
    process.env.LC_MESSAGES = 'en_US.UTF-8'

    const safe = buildSafeEnv()

    expect(safe.LC_ALL).toBe('en_US.UTF-8')
    expect(safe.LC_MESSAGES).toBe('en_US.UTF-8')
  })

  it('forwards ANVIL_* vars', () => {
    process.env.ANVIL_HOME = '/home/user/.anvil'
    process.env.ANVIL_DEBUG = '1'

    const safe = buildSafeEnv()

    expect(safe.ANVIL_HOME).toBe('/home/user/.anvil')
    expect(safe.ANVIL_DEBUG).toBe('1')
  })

  it('forwards NODE_* vars except NODE_OPTIONS', () => {
    process.env.NODE_ENV = 'test'
    process.env.NODE_PATH = '/some/path'
    process.env.NODE_OPTIONS = '--require evil'

    const safe = buildSafeEnv()

    expect(safe.NODE_ENV).toBe('test')
    expect(safe.NODE_PATH).toBe('/some/path')
    expect(safe).not.toHaveProperty('NODE_OPTIONS')
  })

  it('returns an object with only string values', () => {
    const safe = buildSafeEnv()
    for (const value of Object.values(safe)) {
      expect(typeof value).toBe('string')
    }
  })
})
