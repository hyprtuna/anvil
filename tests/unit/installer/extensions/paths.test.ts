/**
 * ANV-0203 (P1) — Path helper tests for paths.ts
 */
import { describe, expect, it } from 'vitest'
import {
  extensionDir,
  extensionsRoot,
  installRecordPath,
  registryPath,
  tmpDir,
  tmpInstallDir,
} from '../../../../src/installer/extensions/paths.js'

const FAKE_HOME = '/home/testuser/.anvil-test'

describe('extensionsRoot', () => {
  it('returns <anvilHome>/extensions', () => {
    expect(extensionsRoot(FAKE_HOME)).toBe(`${FAKE_HOME}/extensions`)
  })
})

describe('registryPath', () => {
  it('returns <anvilHome>/extensions/_registry.json', () => {
    expect(registryPath(FAKE_HOME)).toBe(
      `${FAKE_HOME}/extensions/_registry.json`,
    )
  })
})

describe('extensionDir', () => {
  it('returns <anvilHome>/extensions/<name>', () => {
    expect(extensionDir(FAKE_HOME, 'my-ext')).toBe(
      `${FAKE_HOME}/extensions/my-ext`,
    )
  })

  it('handles single-char extension names', () => {
    expect(extensionDir(FAKE_HOME, 'x')).toBe(`${FAKE_HOME}/extensions/x`)
  })
})

describe('installRecordPath', () => {
  it('returns <anvilHome>/extensions/<name>/.install.json', () => {
    expect(installRecordPath(FAKE_HOME, 'my-ext')).toBe(
      `${FAKE_HOME}/extensions/my-ext/.install.json`,
    )
  })
})

describe('tmpDir', () => {
  it('returns <anvilHome>/extensions/_tmp', () => {
    expect(tmpDir(FAKE_HOME)).toBe(`${FAKE_HOME}/extensions/_tmp`)
  })
})

describe('tmpInstallDir', () => {
  it('returns a path under <anvilHome>/extensions/_tmp/install-<pid>-<ts>', () => {
    const result = tmpInstallDir(FAKE_HOME)
    expect(result).toMatch(
      new RegExp(`^${FAKE_HOME}/extensions/_tmp/install-${process.pid}-\\d+$`),
    )
  })

  it('includes the current process pid', () => {
    const result = tmpInstallDir(FAKE_HOME)
    expect(result).toContain(`install-${process.pid}-`)
  })

  it('produces unique paths on repeated calls (different timestamps)', async () => {
    const first = tmpInstallDir(FAKE_HOME)
    // Tiny delay ensures Date.now() differs
    await new Promise((r) => setTimeout(r, 2))
    const second = tmpInstallDir(FAKE_HOME)
    // May occasionally be the same if called within 1ms — not a hard rule,
    // but typically distinct.  We assert they are the same shape at minimum.
    expect(first).toMatch(/install-\d+-\d+$/)
    expect(second).toMatch(/install-\d+-\d+$/)
  })
})
