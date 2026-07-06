import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_PIN_CAP,
  PinsFile,
  addPin,
  loadPins,
  pinsPath,
  removePin,
  savePins,
} from '../../../../src/core/pins/store.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

describe('core/pins/store', () => {
  let home: string

  beforeEach(() => {
    home = createTestTmpDir('pins')
  })

  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it('returns empty pins when pins.json does not exist', async () => {
    const pins = await loadPins({ home })
    expect(pins).toEqual([])
  })

  it('parses { pins: [...] } shape via zod', async () => {
    await mkdir(dirname(pinsPath(home)), { recursive: true })
    await writeFile(
      pinsPath(home),
      JSON.stringify({ pins: ['planning', 'debugging'] }),
      'utf-8',
    )
    const pins = await loadPins({ home })
    expect(pins).toEqual(['planning', 'debugging'])
  })

  it('addPin persists a new slug', async () => {
    await addPin('planning', { home })
    const raw = await readFile(pinsPath(home), 'utf-8')
    const parsed = PinsFile.parse(JSON.parse(raw))
    expect(parsed.pins).toContain('planning')
  })

  it('addPin is idempotent — adding twice keeps one copy', async () => {
    await addPin('planning', { home })
    await addPin('planning', { home })
    const pins = await loadPins({ home })
    expect(pins.filter((p) => p === 'planning')).toHaveLength(1)
  })

  it('removePin removes an existing slug', async () => {
    await addPin('planning', { home })
    await addPin('debugging', { home })
    await removePin('planning', { home })
    const pins = await loadPins({ home })
    expect(pins).toEqual(['debugging'])
  })

  it('removePin is a no-op for missing slug', async () => {
    await addPin('planning', { home })
    await removePin('nonexistent', { home })
    const pins = await loadPins({ home })
    expect(pins).toEqual(['planning'])
  })

  it('addPin throws with clear message when cap is hit', async () => {
    for (let i = 0; i < DEFAULT_PIN_CAP; i++) {
      await addPin(`skill-${i}`, { home })
    }
    await expect(addPin('one-too-many', { home })).rejects.toThrow(
      /cap.*5|maximum.*5|exceeds/i,
    )
  })

  it('rejects malformed pins.json (not an object)', async () => {
    await mkdir(dirname(pinsPath(home)), { recursive: true })
    await writeFile(pinsPath(home), JSON.stringify('not an object'), 'utf-8')
    await expect(loadPins({ home })).rejects.toThrow()
  })

  it('rejects pins.json with non-string entries', async () => {
    await mkdir(dirname(pinsPath(home)), { recursive: true })
    await writeFile(
      pinsPath(home),
      JSON.stringify({ pins: ['ok', 42] }),
      'utf-8',
    )
    await expect(loadPins({ home })).rejects.toThrow()
  })

  it('savePins writes the canonical shape', async () => {
    await savePins(['a', 'b'], { home })
    const raw = await readFile(pinsPath(home), 'utf-8')
    expect(JSON.parse(raw)).toEqual({ pins: ['a', 'b'] })
  })

  it('respects a custom cap', async () => {
    await addPin('a', { home, cap: 2 })
    await addPin('b', { home, cap: 2 })
    await expect(addPin('c', { home, cap: 2 })).rejects.toThrow(/cap|maximum/i)
  })
})
