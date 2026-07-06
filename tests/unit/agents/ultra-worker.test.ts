import { describe, expect, it } from 'vitest'
import {
  EXTEND_DEPTH_CAP,
  ExtendGraphExhausted,
  buildTaskGraph,
  extendGraph,
  nextStep,
} from '../../../src/agents/ultra-worker.js'

describe('agents/ultra-worker', () => {
  it('builds a linear task graph from a single goal', () => {
    const graph = buildTaskGraph('write a function that adds two numbers')
    expect(graph.nodes).toHaveLength(3)
    expect(graph.nodes[0].kind).toBe('plan')
    expect(graph.nodes[2].kind).toBe('verify')
  })

  it('nextStep returns the next pending node', () => {
    const graph = buildTaskGraph('x')
    const step = nextStep(graph)
    expect(step?.kind).toBe('plan')
  })

  it('nextStep returns undefined when all done', () => {
    const graph = buildTaskGraph('x')
    for (const node of graph.nodes) node.status = 'done'
    expect(nextStep(graph)).toBeUndefined()
  })

  it('extendGraph (default) adds correct → re-execute → re-verify triad', () => {
    const graph = buildTaskGraph('x')
    extendGraph(graph, 'tests failed')
    expect(graph.nodes.length).toBeGreaterThan(3)
    expect(graph.nodes.some((n) => n.kind === 'correct')).toBe(true)
  })

  // T3.5 — status-aware extension.

  it('extendGraph(blocked) emits research → execute → verify sub-triad', () => {
    const graph = buildTaskGraph('x')
    const before = graph.nodes.length
    extendGraph(graph, 'missing credentials', { status: 'blocked' })
    const added = graph.nodes.slice(before)
    expect(added.map((n) => n.kind)).toEqual(['research', 'execute', 'verify'])
    expect(added.every((n) => n.triggeredBy === 'blocked')).toBe(true)
  })

  it('extendGraph(done_with_concerns) emits correct → re-verify sub-pair', () => {
    const graph = buildTaskGraph('x')
    const before = graph.nodes.length
    extendGraph(graph, 'lint warnings remain', {
      status: 'done_with_concerns',
    })
    const added = graph.nodes.slice(before)
    expect(added).toHaveLength(2)
    expect(added.map((n) => n.kind)).toEqual(['correct', 'verify'])
    expect(added.every((n) => n.triggeredBy === 'done_with_concerns')).toBe(
      true,
    )
  })

  it('extendGraph(needs_context) falls back to the default triad', () => {
    const graph = buildTaskGraph('x')
    const before = graph.nodes.length
    extendGraph(graph, 'need more info', { status: 'needs_context' })
    const added = graph.nodes.slice(before)
    expect(added.map((n) => n.kind)).toEqual(['correct', 'execute', 'verify'])
  })

  it('caps extension count per failing node at EXTEND_DEPTH_CAP', () => {
    const graph = buildTaskGraph('x')
    const verify = graph.nodes.find((n) => n.kind === 'verify')!
    for (let i = 0; i < EXTEND_DEPTH_CAP; i++) {
      extendGraph(graph, `round ${i}`, {
        status: 'done_with_concerns',
        failedNodeId: verify.id,
      })
    }
    expect(() =>
      extendGraph(graph, 'too many', {
        status: 'done_with_concerns',
        failedNodeId: verify.id,
      }),
    ).toThrow(ExtendGraphExhausted)
  })
})
