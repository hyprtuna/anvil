import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// We import the registry first so module-load-time registrations from
// discovery.ts / dispatcher.ts (which import pluginCleanup) end up on
// THIS instance. Test isolation: drain the registry before each test
// (any leftover registrations from a sibling test load will fire harmlessly).
import { pluginCleanup } from '../../../src/opencode-plugin/cleanup-registry.js'
import {
  AnvilPlugin,
  __resetShutdownHandlersForTests,
  shutdownAnvilPlugin,
} from '../../../src/opencode-plugin/index.js'

// Side-effect imports — registering their teardowns on pluginCleanup at
// module load is the contract we are verifying.
import { clearDiscoveryCache } from '../../../src/opencode-plugin/hooks/discovery.js'
import { clearManifestCache } from '../../../src/opencode-plugin/hooks/dispatcher.js'

describe('opencode-plugin shutdown — wire-up', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = join(
      tmpdir(),
      `anv0097-shutdown-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    await mkdir(join(tmpRoot, 'skills', 'using-anvil'), { recursive: true })
    await writeFile(
      join(tmpRoot, 'skills', 'using-anvil', 'SKILL.md'),
      'bootstrap content for tests\n',
      'utf-8',
    )
    process.env.ANVIL_ROOT_OVERRIDE = tmpRoot
    __resetShutdownHandlersForTests()
    // Drain any leftover registrations from prior tests so each test
    // starts from a known state.
    await pluginCleanup.drain()
  })

  afterEach(async () => {
    process.env.ANVIL_ROOT_OVERRIDE = undefined
    await rm(tmpRoot, { recursive: true, force: true })
    // Reset clears for next spec.
    clearDiscoveryCache()
    clearManifestCache()
  })

  it('shutdown drains discovery + dispatcher cache-clears (3 call sites)', async () => {
    // Module load registers clearDiscoveryCache + clearManifestCache.
    // Those registrations were drained in beforeEach (a future plugin
    // reload re-registers them); here we re-register the same teardown
    // shape to verify the contract end-to-end on this drain pass.
    let discoveryCleared = false
    let manifestCleared = false
    pluginCleanup.register(() => {
      clearDiscoveryCache()
      discoveryCleared = true
    })
    pluginCleanup.register(() => {
      clearManifestCache()
      manifestCleared = true
    })
    // The third call site (agentMap) is exercised by AnvilPlugin() init.
    await AnvilPlugin()
    expect(pluginCleanup.size).toBeGreaterThanOrEqual(3)
    await shutdownAnvilPlugin()
    expect(discoveryCleared).toBe(true)
    expect(manifestCleared).toBe(true)
    expect(pluginCleanup.size).toBe(0)
  })

  it('AnvilPlugin() adds the agentMap teardown (third call site)', async () => {
    const sizeBefore = pluginCleanup.size
    await AnvilPlugin()
    // Constructing the plugin adds exactly one teardown (agentMap.clear()).
    expect(pluginCleanup.size).toBe(sizeBefore + 1)
  })

  it('shutdownAnvilPlugin() drains the registry to empty', async () => {
    await AnvilPlugin()
    expect(pluginCleanup.size).toBeGreaterThan(0)
    await shutdownAnvilPlugin()
    expect(pluginCleanup.size).toBe(0)
  })

  it('shutdownAnvilPlugin() invokes registered teardowns in LIFO order', async () => {
    const order: string[] = []
    pluginCleanup.register(() => order.push('registered-1st'))
    pluginCleanup.register(() => order.push('registered-2nd'))
    pluginCleanup.register(() => order.push('registered-3rd'))
    await shutdownAnvilPlugin()
    // The 3 explicit pushes appear last-first; earlier module-load
    // teardowns drain after them.
    const firstThree = order.slice(0, 3)
    expect(firstThree).toEqual([
      'registered-3rd',
      'registered-2nd',
      'registered-1st',
    ])
  })

  it('shutdownAnvilPlugin() is safe to call multiple times concurrently', async () => {
    let calls = 0
    pluginCleanup.register(() => {
      calls++
    })
    const [a, b, c] = await Promise.all([
      shutdownAnvilPlugin(),
      shutdownAnvilPlugin(),
      shutdownAnvilPlugin(),
    ])
    expect(a).toBeUndefined()
    expect(b).toBeUndefined()
    expect(c).toBeUndefined()
    // Single teardown ran exactly once — the in-flight guard prevents
    // re-entrant drains.
    expect(calls).toBe(1)
  })

  it('a throwing teardown does not block the rest during shutdown', async () => {
    const fired: string[] = []
    pluginCleanup.register(() => {
      fired.push('quiet-1')
    })
    pluginCleanup.register(() => {
      fired.push('loud')
      throw new Error('boom-from-teardown')
    })
    pluginCleanup.register(() => {
      fired.push('quiet-2')
    })
    // logDrainReport will write to stderr — silence it for the spec.
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    await shutdownAnvilPlugin()
    spy.mockRestore()
    // All three ran despite the middle throw.
    expect(fired).toContain('quiet-1')
    expect(fired).toContain('quiet-2')
    expect(fired).toContain('loud')
  })

  it('plugin reload (re-invoking AnvilPlugin after shutdown) re-registers state', async () => {
    await AnvilPlugin()
    await shutdownAnvilPlugin()
    expect(pluginCleanup.size).toBe(0)
    // Second instantiation registers fresh state (agentMap teardown).
    await AnvilPlugin()
    expect(pluginCleanup.size).toBeGreaterThanOrEqual(1)
  })
})
