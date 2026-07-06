import { existsSync, readFileSync, rmSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

describe('commands/cli/note', () => {
  let tmp: string
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmp = createTestTmpDir('note')
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    rmSync(tmp, { recursive: true, force: true })
  })

  it('append writes a timestamped markdown file under .anvil/notes/', async () => {
    const { noteCommand } = await import(
      '../../../../src/experimental/notepads/cli/note.js'
    )
    const path = await noteCommand({
      cwd: tmp,
      args: ['refactor', 'the', 'thing'],
    })
    expect(path).toBeTruthy()
    expect(existsSync(path as string)).toBe(true)
    const body = readFileSync(path as string, 'utf-8')
    expect(body).toMatch(/refactor the thing/)
    expect(body).toMatch(/^---\n/) // has frontmatter
  })

  it('list returns existing note files newest-first', async () => {
    const { noteCommand } = await import(
      '../../../../src/experimental/notepads/cli/note.js'
    )
    await noteCommand({ cwd: tmp, args: ['first'] })
    // force different timestamp
    await new Promise((r) => setTimeout(r, 1100))
    await noteCommand({ cwd: tmp, args: ['second'] })

    const paths = (await noteCommand({
      cwd: tmp,
      args: ['list'],
    })) as string[]
    expect(Array.isArray(paths)).toBe(true)
    expect(paths.length).toBe(2)
    // newest first: 'second' appears before 'first'
    expect(readFileSync(paths[0], 'utf-8')).toMatch(/second/)
    expect(readFileSync(paths[1], 'utf-8')).toMatch(/first/)
  })

  it('promote <file> emits a todo-shaped markdown block', async () => {
    const { noteCommand } = await import(
      '../../../../src/experimental/notepads/cli/note.js'
    )
    const created = (await noteCommand({
      cwd: tmp,
      args: ['fix the login bug'],
    })) as string

    const out = (await noteCommand({
      cwd: tmp,
      args: ['promote', created],
    })) as string
    expect(out).toMatch(/^- \[ \] /m) // Markdown todo line
    expect(out).toMatch(/fix the login bug/)
  })

  it('append with no text prints usage and returns null', async () => {
    const { noteCommand } = await import(
      '../../../../src/experimental/notepads/cli/note.js'
    )
    const r = await noteCommand({ cwd: tmp, args: [] })
    expect(r).toBeNull()
  })
})
