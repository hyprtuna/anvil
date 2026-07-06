import type { Skill } from '../types.js'
import { SkillFrontmatter } from '../types.js'

/**
 * Append-only skill registry. Skills are loaded at startup and frozen.
 * Precedence: user > language > universal (last registration wins for same name).
 */
export class SkillRegistry {
  private readonly registry = new Map<string, Skill>()

  register(skill: Skill): void {
    // Higher tiers override lower ones: universal < language < user
    const existing = this.registry.get(skill.frontmatter.name)
    if (existing && !this.shouldOverride(existing.tier, skill.tier)) return
    this.registry.set(skill.frontmatter.name, skill)
  }

  get(name: string): Skill | undefined {
    return this.registry.get(name)
  }

  getAll(): Skill[] {
    return [...this.registry.values()]
  }

  /** Spec alias for getAll() — kept for API parity with the design doc. */
  list(): Skill[] {
    return this.getAll()
  }

  has(name: string): boolean {
    return this.registry.has(name)
  }

  get size(): number {
    return this.registry.size
  }

  /**
   * Resolve a skill by name; throw if missing. Useful at call sites that
   * already know the skill must exist (selector output, chain dependencies).
   */
  resolve(name: string): Skill {
    const skill = this.registry.get(name)
    if (!skill) throw new Error(`Skill not found: ${name}`)
    return skill
  }

  /**
   * Build a linear chain starting at `name`, walking `chains[].after` links.
   * Deduplicates and breaks cycles. `before` links are inverted: if skill B
   * declares `{ before: 'A' }`, B runs before A — caller must compose those
   * relationships at selection time, not here.
   */
  chain(name: string): Skill[] {
    const out: Skill[] = []
    const seen = new Set<string>()
    const visit = (n: string): void => {
      if (seen.has(n)) return
      seen.add(n)
      const skill = this.registry.get(n)
      if (!skill) return
      out.push(skill)
      for (const link of skill.frontmatter.chains) {
        if (link.after) visit(link.after)
      }
    }
    visit(name)
    return out
  }

  /**
   * Re-validate every registered skill's frontmatter against the Zod schema.
   * Returns the list of skills whose frontmatter no longer parses — empty
   * means the registry is healthy. Used by `anvil skill validate`.
   */
  validate(): Array<{ name: string; issues: string[] }> {
    const failures: Array<{ name: string; issues: string[] }> = []
    for (const skill of this.registry.values()) {
      const result = SkillFrontmatter.safeParse(skill.frontmatter)
      if (!result.success) {
        failures.push({
          name: skill.frontmatter.name,
          issues: result.error.issues.map(
            (i) => `${i.path.join('.')}: ${i.message}`,
          ),
        })
      }
    }
    return failures
  }

  private shouldOverride(
    existing: Skill['tier'],
    incoming: Skill['tier'],
  ): boolean {
    const priority: Record<Skill['tier'], number> = {
      universal: 0,
      language: 1,
      user: 2,
    }
    return priority[incoming] >= priority[existing]
  }
}
