import { describe, expect, it } from 'vitest'
import {
  AgentFrontmatter,
  AgentHandoff,
  AgentRole,
  EffortLevel,
  HookKind,
  HookResult,
  ModelResolution,
  ModelsConfig,
  ProjectContext,
  RoutingDecision,
  SkillFrontmatter,
} from '../../../src/core/types.js'

describe('core/types — Zod schemas', () => {
  describe('EffortLevel', () => {
    it('accepts valid effort values', () => {
      expect(EffortLevel.parse('low')).toBe('low')
      expect(EffortLevel.parse('medium')).toBe('medium')
      expect(EffortLevel.parse('high')).toBe('high')
      expect(EffortLevel.parse('xhigh')).toBe('xhigh')
      expect(EffortLevel.parse('max')).toBe('max')
    })
    it('rejects invalid effort values', () => {
      expect(() => EffortLevel.parse('crazy')).toThrow()
      expect(() => EffortLevel.parse('normal')).toThrow()
    })
  })

  describe('ModelResolution', () => {
    it('validates a complete resolution', () => {
      const result = ModelResolution.parse({
        model: 'claude-opus-4-6',
        effort: 'high',
        max_tokens: 8192,
        source: 'group',
      })
      expect(result.source).toBe('group')
    })
    it('rejects unknown source values', () => {
      expect(() =>
        ModelResolution.parse({
          model: 'claude-opus-4-6',
          effort: 'high',
          max_tokens: 8192,
          source: 'ouija-board',
        }),
      ).toThrow()
    })
  })

  describe('SkillFrontmatter', () => {
    it('validates a minimal skill', () => {
      const skill = SkillFrontmatter.parse({
        name: 'planning',
        kind: 'atomic',
        group: 'planning',
        description: 'Breaks tasks into subtasks',
        preferred_model: 'claude-opus-4-6',
        preferred_effort: 'high',
      })
      expect(skill.name).toBe('planning')
    })
    it('requires a non-empty name', () => {
      expect(() =>
        SkillFrontmatter.parse({
          name: '',
          kind: 'atomic',
          group: 'planning',
          description: 'x',
          preferred_model: 'claude-opus-4-6',
          preferred_effort: 'high',
        }),
      ).toThrow()
    })
    it('accepts kind at root or omitted (kind moved to x-anvil)', () => {
      // kind is now optional at root — post-migration files carry it under x-anvil.
      // Pre-migration files still have it at root; both must parse without throwing.
      expect(() =>
        SkillFrontmatter.parse({
          name: 'planning',
          group: 'planning',
          description: 'x',
          preferred_model: 'claude-opus-4-6',
          preferred_effort: 'high',
        }),
      ).not.toThrow()
      expect(() =>
        SkillFrontmatter.parse({
          name: 'planning',
          group: 'planning',
          kind: 'atomic',
          description: 'x',
          preferred_model: 'claude-opus-4-6',
          preferred_effort: 'high',
        }),
      ).not.toThrow()
    })
    it('rejects unknown kind', () => {
      expect(() =>
        SkillFrontmatter.parse({
          name: 'planning',
          kind: 'impossible',
          group: 'planning',
          description: 'x',
          preferred_model: 'claude-opus-4-6',
          preferred_effort: 'high',
        }),
      ).toThrow()
    })
  })

  describe('ModelsConfig', () => {
    it('validates a config with defaults and groups', () => {
      const config = ModelsConfig.parse({
        version: '1.0',
        defaults: {
          model: 'claude-sonnet-4-6',
          effort: 'medium',
          max_tokens: 8192,
        },
        groups: {
          planning: {
            model: 'claude-opus-4-6',
            effort: 'high',
            description: 'Deep reasoning',
            members: ['planning', 'deep-diving'],
          },
        },
        overrides: {},
        effort_levels: {
          low: { description: 'fast' },
          medium: { description: 'std' },
          high: { description: 'deep' },
          xhigh: { description: 'very deep' },
          max: { description: 'full' },
        },
        model_aliases: {
          fast: 'claude-haiku-4-5',
          balanced: 'claude-sonnet-4-6',
          powerful: 'claude-opus-4-6',
          default: 'claude-sonnet-4-6',
        },
      })
      expect(config.groups.planning.members).toContain('planning')
    })
  })

  describe('ProjectContext', () => {
    it('validates a detected project', () => {
      const ctx = ProjectContext.parse({
        languages: [
          { name: 'typescript', confidence: 0.95, evidence: ['tsconfig.json'] },
        ],
        frameworks: ['next.js'],
        testRunners: ['vitest'],
        packageManager: 'pnpm',
        ci: ['github-actions'],
        detectedAt: new Date().toISOString(),
      })
      expect(ctx.languages[0].name).toBe('typescript')
    })
  })

  describe('HookResult', () => {
    it('requires valid exit codes', () => {
      HookResult.parse({ exitCode: 0 })
      HookResult.parse({ exitCode: 1, message: 'warn' })
      HookResult.parse({ exitCode: 2, message: 'block' })
      expect(() => HookResult.parse({ exitCode: 3 })).toThrow()
    })

    it('systemInsert is optional and absent by default', () => {
      const r = HookResult.parse({ exitCode: 0 })
      expect(r.systemInsert).toBeUndefined()
    })

    it('systemInsert accepts a string', () => {
      const r = HookResult.parse({
        exitCode: 0,
        message: 'banner',
        systemInsert: 'route to ultra-worker',
      })
      expect(r.systemInsert).toBe('route to ultra-worker')
    })

    it('systemInsert rejects non-string values', () => {
      expect(() =>
        HookResult.parse({ exitCode: 0, systemInsert: 42 }),
      ).toThrow()
    })
  })

  describe('HookKind', () => {
    it('includes session-end and pre-compact in options', () => {
      expect(HookKind.options).toContain('session-end')
      expect(HookKind.options).toContain('pre-compact')
    })
    it('includes pre-tool-use for security handlers (G-8)', () => {
      expect(HookKind.options).toContain('pre-tool-use')
    })
  })

  describe('AgentRole', () => {
    it('accepts all four canonical roles', () => {
      expect(AgentRole.parse('orchestrator')).toBe('orchestrator')
      expect(AgentRole.parse('worker')).toBe('worker')
      expect(AgentRole.parse('verification')).toBe('verification')
      expect(AgentRole.parse('researcher')).toBe('researcher')
    })
    it('rejects legacy AgentCategory values', () => {
      expect(() => AgentRole.parse('specialist')).toThrow()
      expect(() => AgentRole.parse('utility')).toThrow()
    })
  })

  describe('AgentHandoff', () => {
    const validHandoff = {
      from: 'orchestrator',
      to: 'feature-development',
      role: 'worker' as const,
      task: {
        description: 'Implement login form validation',
        successCriteria: ['tests pass', 'lint green'],
        context: {
          files: ['src/auth/login.ts'],
          skills: ['test-driven-development'],
          rules: ['verification-before-completion'],
        },
      },
      artifacts: {
        required: [
          {
            name: 'patch',
            kind: 'file' as const,
            location: 'src/auth/login.ts',
          },
        ],
      },
      status: 'pending' as const,
    }

    it('parses a complete handoff', () => {
      const parsed = AgentHandoff.parse(validHandoff)
      expect(parsed.from).toBe('orchestrator')
      expect(parsed.task.context.skills).toContain('test-driven-development')
    })

    it('accepts optional trace', () => {
      const parsed = AgentHandoff.parse({
        ...validHandoff,
        trace: {
          startedAt: '2026-04-24T00:00:00Z',
          finishedAt: '2026-04-24T00:05:00Z',
          model: 'claude-opus-4-7',
        },
      })
      expect(parsed.trace?.model).toBe('claude-opus-4-7')
    })

    it('rejects invalid status', () => {
      expect(() =>
        AgentHandoff.parse({ ...validHandoff, status: 'mostly_done' }),
      ).toThrow()
    })

    it('rejects invalid role', () => {
      expect(() =>
        AgentHandoff.parse({ ...validHandoff, role: 'specialist' }),
      ).toThrow()
    })

    it('accepts done_with_concerns status', () => {
      const parsed = AgentHandoff.parse({
        ...validHandoff,
        status: 'done_with_concerns',
      })
      expect(parsed.status).toBe('done_with_concerns')
    })
  })

  describe('RoutingDecision', () => {
    const validDecision = {
      intent: 'debug',
      confidence: 0.87,
      agent: 'ultra-worker',
      mode: 'single' as const,
      skills: ['debugging', 'systematic-debugging'],
      rules: {
        prompt: ['verification-before-completion'],
        execution: ['max-chain-depth'],
        safety: ['prompt-guard'],
        workflow: ['CLAUDE.md'],
      },
    }

    it('parses a complete decision', () => {
      const parsed = RoutingDecision.parse(validDecision)
      expect(parsed.intent).toBe('debug')
      expect(parsed.mode).toBe('single')
    })

    it('accepts optional fallback', () => {
      const parsed = RoutingDecision.parse({
        ...validDecision,
        fallback: 'generic',
      })
      expect(parsed.fallback).toBe('generic')
    })

    it('rejects confidence outside 0-1', () => {
      expect(() =>
        RoutingDecision.parse({ ...validDecision, confidence: 1.5 }),
      ).toThrow()
    })

    it('rejects invalid mode', () => {
      expect(() =>
        RoutingDecision.parse({ ...validDecision, mode: 'chaos' }),
      ).toThrow()
    })

    it('rejects invalid fallback', () => {
      expect(() =>
        RoutingDecision.parse({ ...validDecision, fallback: 'panic' }),
      ).toThrow()
    })
  })

  // ── Plan 31 C1 — disambiguator field ────────────────────────────────────
  describe('disambiguator field (Plan 31 C1)', () => {
    const baseSkill = {
      name: 'planning',
      kind: 'atomic' as const,
      group: 'planning',
      description: 'Breaks tasks into subtasks',
      preferred_model: 'claude-opus-4-6',
      preferred_effort: 'high' as const,
    }

    it('SkillFrontmatter accepts disambiguator as optional string', () => {
      const skill = SkillFrontmatter.parse({
        ...baseSkill,
        disambiguator:
          'structured planning — atomic subtasks with dependencies + risk',
      })
      expect(skill.disambiguator).toBe(
        'structured planning — atomic subtasks with dependencies + risk',
      )
    })

    it('SkillFrontmatter treats disambiguator as optional (absent = undefined)', () => {
      const skill = SkillFrontmatter.parse(baseSkill)
      expect(skill.disambiguator).toBeUndefined()
    })

    it('AgentFrontmatter accepts disambiguator as optional string', () => {
      const agent = AgentFrontmatter.parse({
        name: 'orchestrator',
        description: 'Tier 2 parallel fan-out',
        disambiguator:
          'parallel-wave orchestrator — fan-out + synthesis with explicit headers',
      })
      expect(agent.disambiguator).toBe(
        'parallel-wave orchestrator — fan-out + synthesis with explicit headers',
      )
    })

    it('AgentFrontmatter treats disambiguator as optional (absent = undefined)', () => {
      const agent = AgentFrontmatter.parse({
        name: 'orchestrator',
        description: 'Tier 2 parallel fan-out',
      })
      expect(agent.disambiguator).toBeUndefined()
    })
  })

  // Plan 31 H3 — .strict() unknown-field rejection tests
  describe('H3 strict schema unknown-field rejection', () => {
    it('AgentFrontmatter rejects unknown fields (strict mode)', () => {
      expect(() =>
        AgentFrontmatter.parse({
          name: 'test-agent',
          description: 'a test agent',
          typo_field: true,
        }),
      ).toThrow()
    })

    it('HookResult rejects unknown fields (strict mode)', () => {
      expect(() =>
        HookResult.parse({
          exitCode: 0,
          unknown_extra_field: 'oops',
        }),
      ).toThrow()
    })

    it('RoutingDecision rejects unknown fields (strict mode)', () => {
      expect(() =>
        RoutingDecision.parse({
          intent: 'debug',
          confidence: 0.9,
          agent: 'ultra-worker',
          mode: 'single',
          skills: [],
          rules: { prompt: [], execution: [], safety: [], workflow: [] },
          extra_typo_key: 'should fail',
        }),
      ).toThrow()
    })

    it('SkillFrontmatter passes unknown fields gracefully (strict NOT applied — CC color field support)', () => {
      // SkillFrontmatter intentionally does NOT use .strict() because real
      // skill files can carry CC-native fields like `color:` that Anvil does
      // not declare in its schema but must not reject at load time.
      const baseSkill = {
        name: 'test-skill',
        kind: 'atomic',
        group: 'test',
        description: 'a test skill',
        preferred_model: 'claude-sonnet-4-5',
        preferred_effort: 'medium',
      }
      // Should NOT throw even though color is not in the schema
      expect(() =>
        SkillFrontmatter.parse({ ...baseSkill, color: 'cyan' }),
      ).not.toThrow()
    })

    it('HookResult accepts all declared optional fields without error', () => {
      expect(
        HookResult.parse({
          exitCode: 0,
          message: 'hello',
          systemInsert: 'system text',
          context: { key: 'value' },
        }),
      ).toMatchObject({
        exitCode: 0,
        message: 'hello',
        systemInsert: 'system text',
      })
    })
  })
})
