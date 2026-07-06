import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderAgentsFor } from '../../agents/render-matrix.js'
import { filterEmittableSlashCommands } from '../../core/slash-filter.js'
import { stripXAnvil } from '../../core/strip-x-anvil.js'
import type {
  AdapterContext,
  GeneratedFile,
  GeneratedFiles,
} from '../interface.js'
import { buildPluginManifest } from './manifest.js'
import { buildAnvilMarketplace } from './marketplace.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..')
const SLASH_DIR = join(REPO_ROOT, 'src', 'commands', 'slash')
const HOOKS_OUTPUT_DIR = join(REPO_ROOT, 'dist-hooks')

export async function generateClaudeCode(
  ctx: AdapterContext,
): Promise<GeneratedFiles> {
  const files: GeneratedFile[] = []
  const manifest = buildPluginManifest(ctx)

  files.push({
    relativePath: '.claude-plugin/plugin.json',
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  })
  files.push({
    relativePath: '.claude-plugin/marketplace.json',
    content: `${JSON.stringify(buildAnvilMarketplace(ctx), null, 2)}\n`,
  })

  files.push({
    relativePath: 'models.json',
    content: `${JSON.stringify(ctx.config, null, 2)}\n`,
  })

  // Claude Code expects each skill as `skills/<name>/SKILL.md` (literal
  // uppercase filename in a per-skill subdirectory). Flat `skills/<name>.md`
  // files are silently ignored by the plugin loader.
  //
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

  // ANV-0130: Agent rendering is driven by AGENT_CONFIGS['claude-code'].
  // The matrix declares the file-path template (`agents/<name>.md`) and the
  // content strategy (`source-verbatim`); the adapter is a pass-through.
  const renderedAgents = await renderAgentsFor('claude-code', ctx.agents)
  for (const rendered of renderedAgents) {
    files.push({
      relativePath: rendered.relativePath,
      content: rendered.content,
    })
  }

  for (const hook of ctx.hooks) {
    const compiledPath = join(HOOKS_OUTPUT_DIR, `${hook.kind}.cjs`)
    let hookContent: string
    try {
      hookContent = await readFile(compiledPath, 'utf-8')
    } catch {
      throw new Error(
        `hook ${hook.kind} not built at ${compiledPath}; run 'bun run build' first`,
      )
    }
    files.push({
      relativePath: `hooks/${hook.kind}.cjs`,
      content: hookContent,
      executable: true,
    })
  }

  let rawSlashFiles: string[] = []
  try {
    rawSlashFiles = (await readdir(SLASH_DIR)).filter((f) => f.endsWith('.md'))
  } catch {
    // slash dir may not exist in test environments
  }
  // ANV-0257: Load all slash files, then apply the shared experimental filter
  // before emission. filterEmittableSlashCommands uses gray-matter (not regex)
  // so edge-case frontmatter (blank lines, quoted values, etc.) is handled correctly.
  const loadedSlashFiles = await Promise.all(
    rawSlashFiles.map(async (name) => ({
      name,
      content: await readFile(join(SLASH_DIR, name), 'utf-8'),
    })),
  )
  const emittableSlashFiles = filterEmittableSlashCommands(loadedSlashFiles)
  for (const { name: slashFile, content } of emittableSlashFiles) {
    files.push({ relativePath: `commands/${slashFile}`, content })
  }

  const installRoot =
    ctx.scope === 'global' ? (ctx.home ?? process.env.HOME ?? '/tmp') : ctx.cwd
  return { adapterName: 'claude-code', installRoot, files }
}
