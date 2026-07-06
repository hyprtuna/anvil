/**
 * ANV-0130 — agent render baseline snapshot.
 *
 * Captures the byte-for-byte output of every adapter × every real agent in the
 * repo's `agents/` tree. The refactor that introduces AGENT_CONFIGS must
 * preserve these outputs identically; any drift is a regression.
 *
 * Snapshot strategy:
 * - For claude-code: snapshot exact `agents/<name>.md` file content.
 * - For opencode: snapshot the FACT that NO `agents/` path is emitted.
 *
 * Uses inline serialization (a single JSON snapshot per adapter) so a diff
 * shows up as a single Vitest assertion failure, not 19 separate ones.
 */

import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { generateClaudeCode } from '../../../src/adapters/claude-code/generate.js'
import type {
  AdapterContext,
  GeneratedFiles,
} from '../../../src/adapters/interface.js'
import { generateOpenCode } from '../../../src/adapters/opencode/generate.js'
import { loadAllAgents } from '../../../src/agents/load-all.js'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const AGENTS_DIR = join(REPO_ROOT, 'agents')

async function buildContext(): Promise<AdapterContext> {
  const registry = await loadAllAgents({ agentsRoot: AGENTS_DIR })
  // Sort by name so iteration order is deterministic across both adapters.
  const agents = registry
    .getAll()
    .sort((a, b) => a.frontmatter.name.localeCompare(b.frontmatter.name))
  return {
    cwd: REPO_ROOT,
    scope: 'project',
    config: buildDefaultConfig(),
    skills: [],
    hooks: [],
    agents,
  }
}

function projectAgentOutputs(
  generated: GeneratedFiles,
): Array<{ path: string; sha: string; bytes: number; preview: string }> {
  const agentFiles = generated.files
    .filter((f) => f.relativePath.startsWith('agents/'))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  return agentFiles.map((f) => {
    const text =
      typeof f.content === 'string' ? f.content : f.content.toString('utf-8')
    return {
      path: f.relativePath,
      sha: simpleSha(text),
      bytes: Buffer.byteLength(text, 'utf-8'),
      // First 60 chars give a human-readable anchor without ballooning the snapshot.
      preview: text.slice(0, 60),
    }
  })
}

// Tiny non-cryptographic content hash so the snapshot ID survives node version
// bumps; we only need byte-equivalence detection, not collision resistance.
function simpleSha(s: string): string {
  // FNV-1a 32-bit (deterministic, no node-crypto dependency).
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

describe('baseline — agent render byte-for-byte snapshot', () => {
  it('claude-code emits the expected agents/<name>.md set (live tree)', async () => {
    const ctx = await buildContext()
    const out = await generateClaudeCode(ctx)
    const projection = projectAgentOutputs(out)
    expect({
      adapter: out.adapterName,
      agentFileCount: projection.length,
      files: projection,
    }).toMatchSnapshot()
  })

  it('opencode emits NO agents/* paths (live tree)', async () => {
    const ctx = await buildContext()
    const out = await generateOpenCode(ctx)
    const projection = projectAgentOutputs(out)
    expect({
      adapter: out.adapterName,
      agentFileCount: projection.length,
      files: projection,
    }).toMatchSnapshot()
  })
})
