/**
 * Tests for --force flag on anvil plan (Plan 36 Phase F).
 *
 * TDD: tests written first — red before implementation.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkResearchGateForPlan } from '../../../../src/commands/cli/plan.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

// Spec with open questions
const SPEC_WITH_OPEN_QUESTIONS = `---
title: Test Feature
feature_slug: test-feature
version: 0.1.0
status: draft
---

# Test Feature

## Goal

Some goal.

## Open Questions

- What is the best approach?
- How should we handle X?
`

// Spec with empty open questions (gate passes)
const SPEC_WITH_NO_OPEN_QUESTIONS = `---
title: Test Feature
feature_slug: test-feature
version: 0.1.0
status: draft
---

# Test Feature

## Goal

Some goal.

## Open Questions

- (none)
`

let tmpDir: string

beforeEach(async () => {
  tmpDir = createTestTmpDir('plan-force')
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('commands/cli/plan --force', () => {
  describe('checkResearchGateForPlan', () => {
    it('returns blocked=true when spec has open questions and research_gate=true', async () => {
      // ANV-0131: FEATURE_BASE moved from docs/anvil/features to .anvil/specs/features
      const featureDir = join(tmpDir, '.anvil', 'specs', 'features', 'my-feat')
      await mkdir(featureDir, { recursive: true })
      await writeFile(join(featureDir, 'spec.md'), SPEC_WITH_OPEN_QUESTIONS)

      const result = await checkResearchGateForPlan({
        slug: 'my-feat',
        cwd: tmpDir,
        workflowConfig: {
          research_gate: true,
          plan_check: true,
          decision_coverage: true,
          verification: true,
          context_coverage: false,
        },
        force: false,
      })

      expect(result.blocked).toBe(true)
      expect(result.reason).toMatch(/Open Questions/)
    })

    it('returns blocked=false when --force bypasses the gate', async () => {
      // ANV-0131: FEATURE_BASE moved from docs/anvil/features to .anvil/specs/features
      const featureDir = join(tmpDir, '.anvil', 'specs', 'features', 'my-feat')
      await mkdir(featureDir, { recursive: true })
      await writeFile(join(featureDir, 'spec.md'), SPEC_WITH_OPEN_QUESTIONS)

      const result = await checkResearchGateForPlan({
        slug: 'my-feat',
        cwd: tmpDir,
        workflowConfig: {
          research_gate: true,
          plan_check: true,
          decision_coverage: true,
          verification: true,
          context_coverage: false,
        },
        force: true,
      })

      expect(result.blocked).toBe(false)
      // Should emit a warning when forcing
      expect(result.warning).toMatch(/ANVIL_FORCE|force|bypass/i)
    })

    it('returns blocked=false when spec has no open questions', async () => {
      // ANV-0131: FEATURE_BASE moved from docs/anvil/features to .anvil/specs/features
      const featureDir = join(tmpDir, '.anvil', 'specs', 'features', 'my-feat')
      await mkdir(featureDir, { recursive: true })
      await writeFile(join(featureDir, 'spec.md'), SPEC_WITH_NO_OPEN_QUESTIONS)

      const result = await checkResearchGateForPlan({
        slug: 'my-feat',
        cwd: tmpDir,
        workflowConfig: {
          research_gate: true,
          plan_check: true,
          decision_coverage: true,
          verification: true,
          context_coverage: false,
        },
        force: false,
      })

      expect(result.blocked).toBe(false)
    })

    it('returns blocked=false when research_gate=false regardless of open questions', async () => {
      // ANV-0131: FEATURE_BASE moved from docs/anvil/features to .anvil/specs/features
      const featureDir = join(tmpDir, '.anvil', 'specs', 'features', 'my-feat')
      await mkdir(featureDir, { recursive: true })
      await writeFile(join(featureDir, 'spec.md'), SPEC_WITH_OPEN_QUESTIONS)

      const result = await checkResearchGateForPlan({
        slug: 'my-feat',
        cwd: tmpDir,
        workflowConfig: {
          research_gate: false,
          plan_check: true,
          decision_coverage: true,
          verification: true,
          context_coverage: false,
        },
        force: false,
      })

      expect(result.blocked).toBe(false)
    })
  })
})
