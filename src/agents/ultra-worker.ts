/**
 * Ultra-worker — Tier 3 autonomous agent task-graph logic.
 *
 * Tier convention for dispatched sub-tasks: see ./runner.ts → PrepareInvocationOptions.dispatchTierContext.
 */
import type { InvocationStatus } from './runner.js'

export type NodeKind = 'plan' | 'execute' | 'verify' | 'correct' | 'research'
export type NodeStatus = 'pending' | 'running' | 'done' | 'failed'

export interface GraphNode {
  id: string
  kind: NodeKind
  description: string
  status: NodeStatus
  attempts: number
  dependsOn: string[]
  /**
   * When this node was emitted by extendGraph, the invocation status that
   * triggered the extension. Useful for cap-per-reason bookkeeping.
   */
  triggeredBy?: InvocationStatus
}

export interface TaskGraph {
  goal: string
  nodes: GraphNode[]
}

/** Max number of extension sub-triads per failed node before escalating. */
export const EXTEND_DEPTH_CAP = 3

/**
 * Raised when `extendGraph` would extend past `EXTEND_DEPTH_CAP` for a
 * single failing node — treat as an escalation signal (surface to the human
 * operator or the parent orchestrator).
 */
export class ExtendGraphExhausted extends Error {
  readonly nodeId: string
  readonly depth: number
  constructor(nodeId: string, depth: number) {
    super(`extendGraph depth ${depth} exhausted for node ${nodeId}`)
    this.name = 'ExtendGraphExhausted'
    this.nodeId = nodeId
    this.depth = depth
  }
}

export function buildTaskGraph(goal: string): TaskGraph {
  return {
    goal,
    nodes: [
      {
        id: 'plan',
        kind: 'plan',
        description: `Plan how to: ${goal}`,
        status: 'pending',
        attempts: 0,
        dependsOn: [],
      },
      {
        id: 'execute',
        kind: 'execute',
        description: `Execute the plan for: ${goal}`,
        status: 'pending',
        attempts: 0,
        dependsOn: ['plan'],
      },
      {
        id: 'verify',
        kind: 'verify',
        description: `Verify result for: ${goal}`,
        status: 'pending',
        attempts: 0,
        dependsOn: ['execute'],
      },
    ],
  }
}

export function nextStep(graph: TaskGraph): GraphNode | undefined {
  return graph.nodes.find(
    (n) =>
      n.status === 'pending' &&
      n.dependsOn.every(
        (dep) => graph.nodes.find((x) => x.id === dep)?.status === 'done',
      ),
  )
}

/**
 * Extends the task graph with a corrective sub-triad. Branches on
 * invocation status (T3.5):
 *
 *   - 'blocked'             → research → execute → verify (3 nodes).
 *                              A worker blocked on missing context needs
 *                              discovery first.
 *   - 'done_with_concerns'  → correct → re-verify (2 nodes). The worker
 *                              finished but flagged issues; a lighter
 *                              sub-pair fixes them without re-executing
 *                              the whole task.
 *   - 'needs_context' / default (failed tests, exit=non-zero)
 *                           → correct → re-execute → re-verify (original
 *                              behavior — 3 nodes).
 *
 * Hard-cap the number of extensions per failing node at `EXTEND_DEPTH_CAP`
 * to prevent runaway loops on chronic concerns.
 */
export function extendGraph(
  graph: TaskGraph,
  reason: string,
  opts: {
    failedNodeId?: string
    status?: InvocationStatus
  } = {},
): void {
  const status = opts.status
  if (opts.failedNodeId) {
    const priorExtensions = graph.nodes.filter(
      (n) => n.triggeredBy && n.dependsOn.includes(opts.failedNodeId as string),
    ).length
    if (priorExtensions >= EXTEND_DEPTH_CAP) {
      throw new ExtendGraphExhausted(opts.failedNodeId, priorExtensions)
    }
  }

  const parent =
    opts.failedNodeId ??
    (graph.nodes.find((n) => n.kind === 'verify')?.id || 'verify')

  const nextId = (kind: NodeKind): string =>
    `${kind}-${graph.nodes.filter((n) => n.kind === kind).length + 1}`

  if (status === 'blocked') {
    const researchId = nextId('research')
    const execId = nextId('execute')
    const verifyId = nextId('verify')
    graph.nodes.push(
      {
        id: researchId,
        kind: 'research',
        description: `Research (blocked): ${reason}`,
        status: 'pending',
        attempts: 0,
        dependsOn: [parent],
        triggeredBy: status,
      },
      {
        id: execId,
        kind: 'execute',
        description: 'Re-execute after research',
        status: 'pending',
        attempts: 0,
        dependsOn: [researchId],
        triggeredBy: status,
      },
      {
        id: verifyId,
        kind: 'verify',
        description: 'Verify post-research execution',
        status: 'pending',
        attempts: 0,
        dependsOn: [execId],
        triggeredBy: status,
      },
    )
    return
  }

  if (status === 'done_with_concerns') {
    const correctId = nextId('correct')
    const verifyId = nextId('verify')
    graph.nodes.push(
      {
        id: correctId,
        kind: 'correct',
        description: `Correct concerns: ${reason}`,
        status: 'pending',
        attempts: 0,
        dependsOn: [parent],
        triggeredBy: status,
      },
      {
        id: verifyId,
        kind: 'verify',
        description: 'Re-verify after correction',
        status: 'pending',
        attempts: 0,
        dependsOn: [correctId],
        triggeredBy: status,
      },
    )
    return
  }

  // Default: test failure / needs_context / legacy callers — the original
  // correct → re-execute → re-verify triad.
  const correctId = nextId('correct')
  const execId = nextId('execute')
  const verifyId = nextId('verify')
  graph.nodes.push(
    {
      id: correctId,
      kind: 'correct',
      description: `Correct: ${reason}`,
      status: 'pending',
      attempts: 0,
      dependsOn: [parent],
      ...(status ? { triggeredBy: status } : {}),
    },
    {
      id: execId,
      kind: 'execute',
      description: 'Re-execute',
      status: 'pending',
      attempts: 0,
      dependsOn: [correctId],
      ...(status ? { triggeredBy: status } : {}),
    },
    {
      id: verifyId,
      kind: 'verify',
      description: 'Re-verify',
      status: 'pending',
      attempts: 0,
      dependsOn: [execId],
      ...(status ? { triggeredBy: status } : {}),
    },
  )
}
