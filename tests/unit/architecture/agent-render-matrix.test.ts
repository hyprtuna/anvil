/**
 * ANV-0130 — architecture test: agents/render-matrix.ts is the single point
 * of extension for adding adapter-flavored agent rendering.
 *
 * Two structural guarantees are asserted:
 *   1. `src/agents/render-matrix.ts` does NOT import from `src/adapters/`.
 *      The render policy lives in the agent layer; adapters consume it as
 *      data. This keeps layer 3 (`src/agents/`) free of an upward edge to
 *      layer 5 (`src/adapters/`) and prevents the procedural split this
 *      refactor undid.
 *   2. A hypothetical 3rd adapter is purely a config-table change. The
 *      `renderAgent` helper accepts ANY `AgentRenderConfig` instance — no
 *      per-adapter branch is hard-coded in the render code, so introducing
 *      `'cursor'`, `'codex'`, etc. requires only:
 *         (a) extending `AdapterKind`
 *         (b) extending `AGENT_CONFIGS`
 *         (c) writing the adapter scaffold under `src/adapters/<kind>/`
 *      No edit to `render-matrix.ts`'s render code is required.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  AGENT_CONFIGS,
  type AdapterKind,
  type AgentRenderConfig,
  renderAgent,
} from '../../../src/agents/render-matrix.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const RENDER_MATRIX_PATH = join(REPO_ROOT, 'src/agents/render-matrix.ts')

describe('architecture — agents/render-matrix is the extension point', () => {
  it('src/agents/render-matrix.ts does NOT import from src/adapters/', () => {
    const src = readFileSync(RENDER_MATRIX_PATH, 'utf-8')
    // Match any static or dynamic import that points into adapters/.
    // The static check would also catch `from '../adapters/…'` and
    // `from '../../adapters/…'` (the module is at src/agents/).
    const adapterImportRe =
      /(?:import\b[^'"]*['"]|import\(['"])(\.\.\/)+adapters\//
    expect(src).not.toMatch(adapterImportRe)
  })

  it('AGENT_CONFIGS has exactly one entry per AdapterKind', () => {
    // The map IS the discriminated union of supported adapters; any new
    // adapter is a key-by-key extension, never a code change.
    const expectedKinds: AdapterKind[] = ['claude-code', 'opencode']
    expect(Object.keys(AGENT_CONFIGS).sort()).toEqual([...expectedKinds].sort())
  })

  it('renderAgent accepts a config that does NOT correspond to any known adapter — proof that adding a 3rd adapter requires no render-code change', async () => {
    // Construct a config that would represent a hypothetical 3rd adapter
    // (e.g., "cursor") WITHOUT registering it in AGENT_CONFIGS or
    // AdapterKind. If the renderer had hard-coded per-adapter branches,
    // this call would either throw "unknown adapter" or fall through.
    const tmp = createTestTmpDir('arch-anv130')
    const agentPath = join(tmp, 'sample.md')
    writeFileSync(agentPath, '---\nname: sample\n---\nbody\n', 'utf-8')

    const hypothetical3rd: AgentRenderConfig = {
      emit: true,
      pathTemplate: 'plugins/cursor/agents/{name}.md',
      contentSource: 'source-verbatim',
    }

    const rendered = await renderAgent(
      {
        frontmatter: {
          name: 'sample',
          description: 'sample',
          tools: [],
        } as never,
        body: 'body',
        sourcePath: agentPath,
      },
      hypothetical3rd,
    )

    expect(rendered).not.toBeNull()
    expect(rendered?.relativePath).toBe('plugins/cursor/agents/sample.md')
  })
})
