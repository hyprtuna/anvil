import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pushOpenCodePluginReachableRow } from '../../../src/commands/cli/doctor.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

interface Check {
  name: string
  status: string
  detail: string
}

let tmpDir: string

beforeEach(() => {
  tmpDir = createTestTmpDir('doctor-oc-reachable')
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true })
})

describe('pushOpenCodePluginReachableRow', () => {
  it('skips when no OC config is wired and plugin file is absent (CC-only install)', () => {
    const checks: Check[] = []
    pushOpenCodePluginReachableRow(checks, tmpDir, [])
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe('OpenCode plugin built and reachable')
    expect(checks[0].status).toBe('skip')
    expect(checks[0].detail).toContain('no OpenCode config wired')
  })

  it('returns fail when an OC config is wired but plugin index.js is missing', () => {
    const ocConfigDir = join(tmpDir, 'oc-config')
    mkdirSync(ocConfigDir, { recursive: true })
    const ocConfigPath = join(ocConfigDir, 'opencode.json')
    writeFileSync(ocConfigPath, JSON.stringify({ plugin: [] }))

    const checks: Check[] = []
    pushOpenCodePluginReachableRow(checks, tmpDir, [ocConfigPath])
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe('OpenCode plugin built and reachable')
    expect(checks[0].status).toBe('fail')
    expect(checks[0].detail).toContain('plugin entry point missing')
    expect(checks[0].detail).toContain(
      'see docs/opencode-plugin.md#troubleshooting',
    )
  })

  it('returns warn when plugin exists but package.json is missing', () => {
    const pluginDir = join(tmpDir, 'plugins', 'opencode')
    mkdirSync(pluginDir, { recursive: true })
    writeFileSync(join(pluginDir, 'index.js'), 'export default {}')
    // No package.json written

    const checks: Check[] = []
    pushOpenCodePluginReachableRow(checks, tmpDir, [])
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe('OpenCode plugin built and reachable')
    expect(checks[0].status).toBe('warn')
    expect(checks[0].detail).toContain('package.json is missing or unreadable')
    expect(checks[0].detail).toContain(
      'see docs/opencode-plugin.md#troubleshooting',
    )
  })

  it('returns warn when plugin exists but wired config points to different URL', () => {
    const pluginDir = join(tmpDir, 'plugins', 'opencode')
    mkdirSync(pluginDir, { recursive: true })
    writeFileSync(join(pluginDir, 'index.js'), 'export default {}')
    writeFileSync(
      join(pluginDir, 'package.json'),
      JSON.stringify({ name: '@anvil/opencode-plugin', version: '0.1.0' }),
    )

    // Write an OC config that points to a different plugin path
    const ocConfigDir = join(tmpDir, 'oc-config')
    mkdirSync(ocConfigDir, { recursive: true })
    const ocConfigPath = join(ocConfigDir, 'opencode.json')
    writeFileSync(
      ocConfigPath,
      JSON.stringify({
        plugin: ['file:///some/other/plugin'],
      }),
    )

    const checks: Check[] = []
    pushOpenCodePluginReachableRow(checks, tmpDir, [ocConfigPath])
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe('OpenCode plugin built and reachable')
    expect(checks[0].status).toBe('warn')
    expect(checks[0].detail).toContain('OpenCode config does not reference')
    expect(checks[0].detail).toContain(
      'see docs/opencode-plugin.md#troubleshooting',
    )
  })

  it('returns pass when plugin and package.json exist and no config is wired', () => {
    const pluginDir = join(tmpDir, 'plugins', 'opencode')
    mkdirSync(pluginDir, { recursive: true })
    writeFileSync(join(pluginDir, 'index.js'), 'export default {}')
    writeFileSync(
      join(pluginDir, 'package.json'),
      JSON.stringify({ name: '@anvil/opencode-plugin', version: '0.1.0' }),
    )

    // No config paths wired
    const checks: Check[] = []
    pushOpenCodePluginReachableRow(checks, tmpDir, [])
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe('OpenCode plugin built and reachable')
    expect(checks[0].status).toBe('pass')
    expect(checks[0].detail).toContain('present and package.json valid')
  })

  it('returns pass when plugin and package.json exist and config points to expected URL', () => {
    const pluginDir = join(tmpDir, 'plugins', 'opencode')
    mkdirSync(pluginDir, { recursive: true })
    writeFileSync(join(pluginDir, 'index.js'), 'export default {}')
    writeFileSync(
      join(pluginDir, 'package.json'),
      JSON.stringify({ name: '@anvil/opencode-plugin', version: '0.1.0' }),
    )

    // Write an OC config that points to the expected plugin path
    const expectedUrl = `file://${join(tmpDir, 'plugins', 'opencode')}`
    const ocConfigDir = join(tmpDir, 'oc-config')
    mkdirSync(ocConfigDir, { recursive: true })
    const ocConfigPath = join(ocConfigDir, 'opencode.json')
    writeFileSync(ocConfigPath, JSON.stringify({ plugin: [expectedUrl] }))

    const checks: Check[] = []
    pushOpenCodePluginReachableRow(checks, tmpDir, [ocConfigPath])
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe('OpenCode plugin built and reachable')
    expect(checks[0].status).toBe('pass')
  })

  it('warns when wired URL is a near-miss prefix (e.g. -evil suffix)', () => {
    const pluginDir = join(tmpDir, 'plugins', 'opencode')
    mkdirSync(pluginDir, { recursive: true })
    writeFileSync(join(pluginDir, 'index.js'), 'export default {}')
    writeFileSync(
      join(pluginDir, 'package.json'),
      JSON.stringify({ name: '@anvil/opencode-plugin', version: '0.1.0' }),
    )
    const evilUrl = `file://${join(tmpDir, 'plugins', 'opencode')}-evil/index.js`
    const ocConfigDir = join(tmpDir, 'oc-config')
    mkdirSync(ocConfigDir, { recursive: true })
    const ocConfigPath = join(ocConfigDir, 'opencode.json')
    writeFileSync(ocConfigPath, JSON.stringify({ plugin: [evilUrl] }))

    const checks: Check[] = []
    pushOpenCodePluginReachableRow(checks, tmpDir, [ocConfigPath])
    expect(checks[0].status).toBe('warn')
    expect(checks[0].detail).toContain('OpenCode config does not reference')
  })

  it('skips non-existent config paths without throwing', () => {
    const pluginDir = join(tmpDir, 'plugins', 'opencode')
    mkdirSync(pluginDir, { recursive: true })
    writeFileSync(join(pluginDir, 'index.js'), 'export default {}')
    writeFileSync(
      join(pluginDir, 'package.json'),
      JSON.stringify({ name: '@anvil/opencode-plugin', version: '0.1.0' }),
    )

    // Pass a non-existent config path — should not throw
    const checks: Check[] = []
    pushOpenCodePluginReachableRow(checks, tmpDir, [
      join(tmpDir, 'does-not-exist', 'opencode.json'),
    ])
    expect(checks[0].status).toBe('pass')
  })
})
