/**
 * Deterministic skill-trigger fixture (ANV-0036 AC-3, updated for ANV-0045).
 *
 * Tests the `validateSkillFiresFirst` validator against synthetic transcripts.
 * No LLM calls — this runs in CI without any network or API access.
 *
 * Live LLM-based triggering evaluation is scoped to ANV-0045 (`anvil doctor --live`).
 */

import { describe, expect, it } from 'vitest'
import {
  type TranscriptToolUse,
  validateSkillFiresFirst,
} from './transcript-validator.js'

const skill = (slug: string): TranscriptToolUse => ({
  name: 'Skill',
  input: { skill: `anvil:${slug}` },
})
const read: TranscriptToolUse = {
  name: 'Read',
  input: { file_path: '/tmp/foo.ts' },
}
const bash: TranscriptToolUse = { name: 'Bash', input: { command: 'ls' } }
const edit: TranscriptToolUse = {
  name: 'Edit',
  input: { file_path: '/tmp/foo.ts' },
}
const grep: TranscriptToolUse = { name: 'Grep', input: { pattern: 'foo' } }
const glob: TranscriptToolUse = { name: 'Glob', input: { pattern: '**/*.ts' } }

describe('validateSkillFiresFirst', () => {
  it('pass when Skill fires before any action tool', () => {
    const result = validateSkillFiresFirst([skill('code-review'), read, bash])
    expect(result.verdict).toBe('pass')
    expect(result.skillCallIndex).toBe(0)
    expect(result.firstActionIndex).toBeGreaterThan(0)
  })

  it('pass when only Skill is called (no action tools)', () => {
    const result = validateSkillFiresFirst([skill('planning')])
    expect(result.verdict).toBe('pass')
    expect(result.firstActionIndex).toBe(-1)
  })

  it('warn when action tool fires before Skill', () => {
    const result = validateSkillFiresFirst([bash, skill('code-review')])
    expect(result.verdict).toBe('warn')
    expect(result.firstActionIndex).toBe(0)
    expect(result.skillCallIndex).toBeGreaterThan(0)
  })

  it('fail when no Skill is called at all', () => {
    const result = validateSkillFiresFirst([read, bash, edit])
    expect(result.verdict).toBe('fail')
    expect(result.skillCallIndex).toBe(-1)
  })

  it('skip on empty transcript', () => {
    const result = validateSkillFiresFirst([])
    expect(result.verdict).toBe('skip')
  })

  it('skip when transcript contains only read-only tools', () => {
    const result = validateSkillFiresFirst([read, grep, glob])
    expect(result.verdict).toBe('skip')
  })

  it('pass when read-only tools fire before Skill (read-only is allowed)', () => {
    const result = validateSkillFiresFirst([
      grep,
      glob,
      skill('code-review'),
      bash,
    ])
    expect(result.verdict).toBe('pass')
    expect(result.skillCallIndex).toBe(2)
  })

  it('fail when only action tools fire (no Skill, one action)', () => {
    const result = validateSkillFiresFirst([bash])
    expect(result.verdict).toBe('fail')
    expect(result.firstActionIndex).toBe(0)
  })

  it('skill call index is tracked correctly with multiple tools', () => {
    const result = validateSkillFiresFirst([
      skill('orchestration'),
      skill('planning'),
      read,
    ])
    expect(result.verdict).toBe('pass')
    expect(result.skillCallIndex).toBe(0)
  })

  it('skip when only one read-only tool fires', () => {
    const result = validateSkillFiresFirst([read])
    expect(result.verdict).toBe('skip')
  })
})
