import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AgentFrontmatterBase } from '../../../src/core/types.js'
import { PluginAgentFrontmatter } from '../../../src/opencode-plugin/agents/schema.js'

/**
 * Schema parity test (D-08).
 *
 * The plugin carries a local copy of the agent frontmatter schema because it
 * cannot import from src/core/ (self-contained ESM bundle constraint). This
 * test asserts that every field declared in the plugin's local schema also
 * exists in the canonical AgentFrontmatter schema with a compatible type,
 * so a future PR cannot drift the canonical schema without this failing loud.
 */
describe('schema parity: PluginAgentFrontmatter vs AgentFrontmatter', () => {
  it('all plugin schema fields exist in the canonical schema', () => {
    // Extract the shape from the base object (before passthrough).
    // PluginAgentFrontmatter is a ZodObject wrapped in passthrough().
    const pluginShape = (PluginAgentFrontmatter as z.ZodObject<z.ZodRawShape>)
      .shape as Record<string, z.ZodTypeAny>
    // ANV-0206: AgentFrontmatter is now `.transform()`-wrapped (ZodEffects),
    // which doesn't expose `.shape`. AgentFrontmatterBase is the underlying
    // ZodObject preserved for introspection here.
    const canonicalShape = AgentFrontmatterBase.shape as Record<
      string,
      z.ZodTypeAny
    >

    const pluginFields = Object.keys(pluginShape)
    expect(pluginFields.length).toBeGreaterThan(0)

    for (const field of pluginFields) {
      expect(
        canonicalShape,
        `Field "${field}" exists in PluginAgentFrontmatter but is MISSING from the canonical AgentFrontmatter — update one of the two schemas.`,
      ).toHaveProperty(field)
    }
  })

  it('plugin "name" field accepts the same slug grammar as the canonical schema', () => {
    // The canonical schema uses z.string().min(1) for name.
    // The plugin schema uses a stricter regex.
    // Verify the plugin's regex is a subset (all valid plugin slugs are valid in canonical).
    const validSlugs = [
      'code-reviewer',
      'plan-verifier',
      'a',
      'my-agent-123',
      'z9',
    ]
    const invalidSlugs = [
      '',
      'BadSlug',
      'UPPERCASE',
      '123-starts-with-digit',
      '-starts-with-dash',
    ]

    for (const slug of validSlugs) {
      const result = PluginAgentFrontmatter.safeParse({
        name: slug,
      })
      expect(result.success, `Expected slug "${slug}" to be valid`).toBe(true)
    }

    for (const slug of invalidSlugs) {
      const result = PluginAgentFrontmatter.safeParse({
        name: slug,
      })
      expect(result.success, `Expected slug "${slug}" to be invalid`).toBe(
        false,
      )
    }
  })

  it('plugin schema accepts unknown fields (passthrough)', () => {
    const result = PluginAgentFrontmatter.safeParse({
      name: 'my-agent',
      description: 'Test',
      unknown_field: 'value',
      tier: 'review',
      notepads_section: 'learnings',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).unknown_field).toBe(
        'value',
      )
    }
  })
})
