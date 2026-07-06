import { describe, expect, it } from 'vitest'
import {
  formatTokenCount,
  renderSubagentBatch,
  renderSubagentLine,
} from '../../../../src/core/statusline/subagent.js'
import type { SubagentTask } from '../../../../src/core/statusline/subagent.js'

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape stripper needs literal ESC byte.
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '')

const baseTask: SubagentTask = {
  id: 'task-1',
  name: 'claude-opus-4-7',
  status: 'running',
  startTime: Date.now() - 5000, // 5 seconds ago
  tokenCount: 1500,
}

describe('core/statusline/subagent — single-task render', () => {
  it('returns correct id in output', () => {
    const out = renderSubagentLine(baseTask)
    expect(out.id).toBe('task-1')
  })

  it('content contains status badge and model name', () => {
    const content = stripAnsi(renderSubagentLine(baseTask).content)
    // running = ●, model name present
    expect(content).toMatch(/●/)
    expect(content).toMatch(/claude-opus-4-7/)
  })

  it('content contains elapsed time', () => {
    const content = stripAnsi(renderSubagentLine(baseTask).content)
    // 5 seconds → "5s"
    expect(content).toMatch(/\d+s/)
  })

  it('content contains token count', () => {
    const content = stripAnsi(renderSubagentLine(baseTask).content)
    expect(content).toMatch(/tok:1\.5k/)
  })

  it('uses label over name when label is set', () => {
    const content = stripAnsi(
      renderSubagentLine({ ...baseTask, label: 'my-agent', name: 'opus' })
        .content,
    )
    expect(content).toMatch(/my-agent/)
    expect(content).not.toMatch(/\bopus\b/)
  })

  it('renders different status badges', () => {
    const statuses: Array<[string, string]> = [
      ['running', '●'],
      ['pending', '○'],
      ['done', '✓'],
      ['error', '✗'],
    ]
    for (const [status, badge] of statuses) {
      const content = stripAnsi(
        renderSubagentLine({ ...baseTask, status }).content,
      )
      expect(content).toMatch(badge)
    }
  })

  it('omits elapsed when startTime is absent', () => {
    const task: SubagentTask = { id: 't', name: 'n', status: 'pending' }
    const content = stripAnsi(renderSubagentLine(task).content)
    // No time segments like "5s" or "1m30s" when no startTime
    expect(content).not.toMatch(/\d+s\b/)
    expect(content).not.toMatch(/\d+m\d+s\b/)
  })

  it('omits tok: segment when tokenCount is absent', () => {
    const task: SubagentTask = { id: 't', name: 'n' }
    const content = stripAnsi(renderSubagentLine(task).content)
    expect(content).not.toMatch(/tok:/)
  })
})

describe('core/statusline/subagent — multi-task batch', () => {
  it('returns one entry per task', () => {
    const tasks: SubagentTask[] = [
      { id: 'a', name: 'opus', status: 'running' },
      { id: 'b', name: 'sonnet', status: 'pending' },
      { id: 'c', name: 'haiku', status: 'done' },
    ]
    const lines = renderSubagentBatch(tasks)
    expect(lines).toHaveLength(3)
    expect(lines.map((l) => l.id)).toEqual(['a', 'b', 'c'])
  })

  it('each entry has non-empty content', () => {
    const tasks: SubagentTask[] = [
      { id: 'x', name: 'claude-sonnet', status: 'running', tokenCount: 200 },
    ]
    const [line] = renderSubagentBatch(tasks)
    expect(stripAnsi(line.content).length).toBeGreaterThan(0)
  })
})

describe('core/statusline/subagent — free-tier absence path', () => {
  it('renders empty batch when tasks array is empty', () => {
    expect(renderSubagentBatch([])).toEqual([])
  })

  it('formatTokenCount handles undefined (no tokens recorded)', () => {
    expect(formatTokenCount(undefined)).toBeUndefined()
  })

  it('formatTokenCount handles zero (no usage)', () => {
    expect(formatTokenCount(0)).toBeUndefined()
  })

  it('formatTokenCount formats small counts', () => {
    expect(formatTokenCount(500)).toBe('500')
  })

  it('formatTokenCount formats thousands', () => {
    expect(formatTokenCount(2500)).toBe('2.5k')
  })

  it('formatTokenCount formats millions', () => {
    expect(formatTokenCount(1_500_000)).toBe('1.5M')
  })
})
