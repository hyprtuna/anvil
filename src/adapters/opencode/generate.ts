import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderAgentsFor } from '../../agents/render-matrix.js'
import { resolveOcHook } from '../../core/manifest-schema/opencode.js'
import { stripXAnvil } from '../../core/strip-x-anvil.js'
import type {
  AdapterContext,
  GeneratedFile,
  GeneratedFiles,
} from '../interface.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..')
const PLUGIN_DIST = join(REPO_ROOT, 'dist', 'opencode-plugin', 'index.js')
const PLUGIN_TEMPLATE = join(
  REPO_ROOT,
  'src',
  'opencode-plugin',
  'package.template.json',
)

async function readPluginIndex(): Promise<string> {
  try {
    return await readFile(PLUGIN_DIST, 'utf-8')
  } catch {
    throw new Error(
      `OpenCode plugin not built at ${PLUGIN_DIST}; run 'npm run build' first.`,
    )
  }
}

export async function generateOpenCode(
  ctx: AdapterContext,
): Promise<GeneratedFiles> {
  const files: GeneratedFile[] = []

  // ── Plugin package.json ────────────────────────────────────────────────
  const templateRaw = await readFile(PLUGIN_TEMPLATE, 'utf-8')
  const templateJson = JSON.parse(templateRaw) as Record<string, unknown>
  templateJson.version = ctx.config.version ?? '0.0.0'

  // Plan 28 Phase B1 — declare the OpenCode hook event mapping inside
  // the package.json's `anvil` block so doctor can verify wiring and the
  // cross-platform parity test can assert no hook is silently dropped.
  const mapped: Array<{ kind: string; event: string }> = []
  const unmapped: string[] = []
  for (const hook of ctx.hooks) {
    const resolved = resolveOcHook(hook.kind)
    if (resolved.status === 'mapped')
      mapped.push({ kind: hook.kind, event: resolved.event })
    else unmapped.push(hook.kind)
  }
  templateJson.anvil = { hooks: { mapped, unmapped } }

  files.push({
    relativePath: 'plugins/opencode/package.json',
    content: `${JSON.stringify(templateJson, null, 2)}\n`,
  })

  // ── Plugin index.js ────────────────────────────────────────────────────
  const pluginIndex = await readPluginIndex()
  files.push({
    relativePath: 'plugins/opencode/index.js',
    content: pluginIndex,
  })

  // ── Skills ─────────────────────────────────────────────────────────────
  // When skills.lazy_load is true (Plan 32 B5), emit a single index file
  // instead of per-skill SKILL.md files to reduce manifest size.
  const lazyLoad = ctx.config.skills?.lazy_load ?? false
  if (lazyLoad) {
    const index = ctx.skills.map((skill) => ({
      name: skill.frontmatter.name,
      description: skill.frontmatter.description,
      frontmatter: skill.frontmatter,
    }))
    files.push({
      relativePath: 'skills/_index.json',
      content: `${JSON.stringify(index, null, 2)}\n`,
    })
  } else {
    for (const skill of ctx.skills) {
      const raw = await readFile(skill.sourcePath, 'utf-8')
      // ANV-0206: strip x-anvil: from emitted skill files so host tools never see it.
      const content = stripXAnvil(raw)
      files.push({
        relativePath: `skills/${skill.frontmatter.name}/SKILL.md`,
        content,
      })
    }
  }

  // ── Agents ─────────────────────────────────────────────────────────────
  // ANV-0130: Agent rendering is driven by AGENT_CONFIGS['opencode'].
  // OpenCode declares `emit: false` — agents are routed through the plugin
  // loader at plugins/opencode/, not surfaced as filesystem entries — so
  // this call is a deliberate no-op today. Going through the matrix
  // instead of leaving the agent loop absent makes the policy explicit
  // and lets future opencode versions opt into direct emission by
  // flipping the config flag (no adapter-code change required).
  const renderedAgents = await renderAgentsFor('opencode', ctx.agents)
  for (const rendered of renderedAgents) {
    files.push({
      relativePath: rendered.relativePath,
      content: rendered.content,
    })
  }

  // ANV-0257: OC does not yet emit slash command files (no slash dir analogue in
  // the OC output layout). When OC adds slash emission, load files from SLASH_DIR,
  // filter with filterEmittableSlashCommands (src/core/slash-filter.ts), then push
  // to `files`. See CC adapter for the reference implementation.
  // SLASH-FILTER-WIRED: false — update to true and add emit loop when OC supports slash commands.

  const installRoot =
    ctx.scope === 'global' ? (ctx.home ?? process.env.HOME ?? '/tmp') : ctx.cwd
  return { adapterName: 'opencode', installRoot, files }
}
