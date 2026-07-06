import type { Skill } from '../core/types.js'

export const DEFAULT_MAX_CHAIN_DEPTH = 6

/**
 * Thrown when `composeChain` detects a directed cycle via 3-color DFS.
 * The `cycle` field names the nodes on the offending back-edge path.
 */
export class ChainCycleDetected extends Error {
  readonly cycle: string[]
  constructor(cycle: string[]) {
    super(`chain cycle detected: ${cycle.join(' → ')}`)
    this.name = 'ChainCycleDetected'
    this.cycle = cycle
  }
}

/**
 * Thrown when chain traversal exceeds `maxDepth` hops from the entry skill.
 * Default cap is 6 — see architecture §6.2.1.
 */
export class ChainDepthExceeded extends Error {
  readonly depth: number
  readonly chain: string[]
  constructor(depth: number, chain: string[]) {
    super(`chain depth ${depth} exceeds max; chain=${chain.join(' → ')}`)
    this.name = 'ChainDepthExceeded'
    this.depth = depth
    this.chain = chain
  }
}

type Color = 'white' | 'gray' | 'black'

/**
 * Composes a sequential skill chain starting from `entrySkillName`.
 * Uses the `chains` frontmatter to determine before/after relationships.
 * Returns an ordered list of skill names.
 *
 * Upgrades (v2, T2.13):
 *  • 3-color DFS detects cycles deterministically.
 *  • Depth cap (default 6) short-circuits runaway graphs.
 *  • Sibling `after` / `before` targets are traversed in alphabetical order
 *    so the composed chain is stable across runs.
 */
export function composeChain(
  entrySkillName: string,
  skills: Skill[],
  maxDepth: number = DEFAULT_MAX_CHAIN_DEPTH,
): string[] {
  const byName = new Map(skills.map((s) => [s.frontmatter.name, s]))
  const entry = byName.get(entrySkillName)
  if (!entry) return [entrySkillName]

  // Named-workflow short-circuit (T2.14): the composite skill declares an
  // explicit phase order; `chains[]` is reserved for intra-phase ordering.
  if (entry.frontmatter.workflow) {
    const { phases } = entry.frontmatter.workflow
    if (phases.length > maxDepth) {
      throw new ChainDepthExceeded(phases.length, phases)
    }
    const seen = new Set<string>()
    for (const phase of phases) {
      if (seen.has(phase)) {
        throw new ChainCycleDetected([phase, phase])
      }
      seen.add(phase)
    }
    return [...phases]
  }

  const chain: string[] = []
  const color = new Map<string, Color>()
  const stack: string[] = []

  function visit(skillName: string, depth: number): void {
    if (depth > maxDepth) {
      throw new ChainDepthExceeded(depth, [...stack, skillName])
    }
    const c = color.get(skillName) ?? 'white'
    if (c === 'black') return
    if (c === 'gray') {
      const start = stack.indexOf(skillName)
      const cyclePath =
        start === -1
          ? [...stack, skillName]
          : stack.slice(start).concat(skillName)
      throw new ChainCycleDetected(cyclePath)
    }

    color.set(skillName, 'gray')
    stack.push(skillName)

    const skill = byName.get(skillName)
    if (skill) {
      const afters = skill.frontmatter.chains
        .map((rel) => rel.after)
        .filter((v): v is string => Boolean(v))
        .sort()
      for (const after of afters) visit(after, depth + 1)
    }

    chain.push(skillName)

    if (skill) {
      const befores = skill.frontmatter.chains
        .map((rel) => rel.before)
        .filter((v): v is string => Boolean(v) && byName.has(v as string))
        .sort()
      for (const before of befores) visit(before, depth + 1)
    }

    color.set(skillName, 'black')
    stack.pop()
  }

  visit(entrySkillName, 0)
  return chain
}
