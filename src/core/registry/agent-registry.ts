import type { Agent } from '../types.js'

export class AgentRegistry {
  private readonly registry = new Map<string, Agent>()

  register(agent: Agent): void {
    this.registry.set(agent.frontmatter.name, agent)
  }

  get(name: string): Agent | undefined {
    return this.registry.get(name)
  }

  getAll(): Agent[] {
    return [...this.registry.values()]
  }

  has(name: string): boolean {
    return this.registry.has(name)
  }

  get size(): number {
    return this.registry.size
  }
}
