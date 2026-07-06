import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateClaudeCode } from '../adapters/claude-code/generate.js'
import { buildAnvilMarketplace } from '../adapters/claude-code/marketplace.js'
import type {
  AdapterContext,
  GeneratedFile,
  GeneratedSymlink,
} from '../adapters/interface.js'
import { generateOpenCode } from '../adapters/opencode/generate.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..')

export interface StagedAnvilHome {
  files: GeneratedFile[]
  symlinks: GeneratedSymlink[]
  /**
   * Plan 33 G1: paths of source directories to mirror into ~/.anvil/runtime/.
   * Each entry is an absolute path on disk; sync.ts copies them into the
   * staging directory under runtime/<basename> before the atomic swap.
   * Missing directories (e.g. dist-hooks/ on a fresh checkout) are skipped.
   */
  runtimeMirrorSources: string[]
}

export async function stageAnvilHome(
  ctx: AdapterContext,
): Promise<StagedAnvilHome> {
  const files: GeneratedFile[] = []
  const symlinks: GeneratedSymlink[] = []

  // 1. Version stamp
  const pkg = JSON.parse(
    await readFile(join(REPO_ROOT, 'package.json'), 'utf-8'),
  ) as {
    version: string
  }
  const sha = process.env.ANVIL_BUILD_SHA ?? 'local'
  files.push({ relativePath: 'version', content: `${pkg.version}+${sha}\n` })

  // 2. Top-level marketplace (canonical CC marketplace at root)
  const mp = buildAnvilMarketplace(ctx)
  files.push({
    relativePath: '.claude-plugin/marketplace.json',
    content: `${JSON.stringify(mp, null, 2)}\n`,
  })

  // 3. Canonical payload via opencode generator
  // generateOpenCode emits: plugins/opencode/package.json, plugins/opencode/index.js,
  //   skills/<name>/SKILL.md
  // Note: OpenCode no longer emits agents/, hooks/, or models.json — those dead
  // artifact paths were removed in v0.11.2 Bundle D Phase 3. The canonical
  // agents/, hooks/, and models.json are sourced from the CC generator below.
  const oc = await generateOpenCode(ctx)
  for (const f of oc.files) {
    files.push(f)
  }

  // 4. Claude Code plugin at plugins/claude-code/
  // generateClaudeCode emits: .claude-plugin/plugin.json, .claude-plugin/marketplace.json,
  //   models.json, skills/, agents/, hooks/, commands/
  const cc = await generateClaudeCode(ctx)
  for (const f of cc.files) {
    if (f.relativePath === '.claude-plugin/plugin.json') {
      files.push({
        ...f,
        relativePath: 'plugins/claude-code/.claude-plugin/plugin.json',
      })
    } else if (f.relativePath === 'models.json') {
      // models.json is canonical here (CC is the authoritative emitter post D-07)
      files.push(f)
    } else if (f.relativePath === '.claude-plugin/marketplace.json') {
      // skip — top-level already added
    } else if (f.relativePath.startsWith('commands/')) {
      // Slash commands: CC is the sole emitter, so stage them into the canonical
      // layout at ~/.anvil/commands/. The platform symlink below exposes them
      // to Claude Code at plugins/claude-code/commands/.
      files.push(f)
    } else if (f.relativePath.startsWith('skills/')) {
      // skip — canonical copies already staged via opencode generator
    } else if (
      f.relativePath.startsWith('agents/') ||
      f.relativePath.startsWith('hooks/')
    ) {
      // agents/ and hooks/ are now canonical from CC (OC no longer emits them
      // post v0.11.2 Bundle D Phase 3 — they route through the plugin loader).
      files.push(f)
    } else {
      // Any CC file not explicitly mapped or skipped is unrecognised — warn only in verbose mode.
      if (process.env.ANVIL_VERBOSE) {
        console.warn(
          `[stage] Unrecognised CC generator output dropped: ${f.relativePath}`,
        )
      }
    }
  }

  // Warn if CC adapter emits symlinks — they are not merged into the canonical layout
  if (cc.symlinks && cc.symlinks.length > 0 && process.env.ANVIL_VERBOSE) {
    console.warn(
      `[stage] CC adapter emitted ${cc.symlinks.length} symlink(s) — ignored; stage controls symlinks directly`,
    )
  }

  // 5. Templates — small files wiring reads at apply time.
  //    `wireClaudeCodeProject` copies statusline.sh into `.claude/` on --statusline.
  const statuslineTemplate = await readFile(
    join(REPO_ROOT, 'templates', 'statusline.sh'),
    'utf-8',
  )
  files.push({
    relativePath: 'templates/statusline.sh',
    content: statuslineTemplate,
    executable: true,
  })

  // Plan 36 Phase C: SDD skeleton templates.
  for (const name of ['spec.md', 'plan.md', 'tasks.md'] as const) {
    const content = await readFile(join(REPO_ROOT, 'templates', name), 'utf-8')
    files.push({ relativePath: `templates/${name}`, content })
  }

  // 6. Bin files — Plan 33 G2: shims now resolve via ~/.anvil/runtime/ (the
  //    runtime mirror written in step 7 below) rather than embedding an
  //    absolute install-time source path. This means the shims survive
  //    source-repo moves, renames, and worktree deletions.
  //
  //    The shims point at dist/anvil-bundle.cjs (a self-contained esbuild CJS
  //    bundle with all npm deps inlined) so no node_modules/ directory is
  //    needed at runtime. The bundle is built by scripts/build-bundle.mjs as
  //    part of `npm run build`.
  files.push({
    relativePath: 'bin/anvil.cjs',
    executable: true,
    content: `#!/usr/bin/env node
'use strict'
const { homedir } = require('node:os')
const { existsSync } = require('node:fs')
const runtimeRoot = homedir() + '/.anvil/runtime'
const distEntry = runtimeRoot + '/dist/anvil-bundle.cjs'
if (!existsSync(distEntry)) {
  console.error('anvil runtime missing at ' + runtimeRoot + ' — re-run \`~/.anvil/bin/install.cjs\` from a valid source checkout to recover.')
  process.exit(1)
}
require(distEntry)
`,
  })
  files.push({
    relativePath: 'bin/install.cjs',
    executable: true,
    content: `#!/usr/bin/env node
'use strict'
const { homedir } = require('node:os')
const { existsSync } = require('node:fs')
const runtimeRoot = homedir() + '/.anvil/runtime'
const installerEntry = runtimeRoot + '/dist/installer-bundle.cjs'
if (!existsSync(installerEntry)) {
  console.error('anvil installer runtime missing at ' + runtimeRoot + ' — clone a fresh source checkout and run ./install.sh to recover.')
  process.exit(1)
}
require(installerEntry)
`,
  })

  // 7. Symlinks: platform views → canonical payload
  for (const dir of ['skills', 'agents', 'hooks', 'commands']) {
    symlinks.push({
      linkPath: `plugins/claude-code/${dir}`,
      target: `../../${dir}`,
    })
  }
  symlinks.push({ linkPath: 'plugins/opencode/skills', target: '../../skills' })

  // 8. Plan 33 G1: runtime mirror sources.
  //    dist/ and dist-hooks/ from the source repo are copied into
  //    ~/.anvil/runtime/ by sync.ts so the user-facing shims (bin/anvil.cjs,
  //    bin/install.cjs) can resolve their entry points independently of the
  //    install-time source path. package.json is embedded as a GeneratedFile
  //    above; the larger directories are listed here for streaming cp().
  const runtimeMirrorSources: string[] = []
  const distDir = join(REPO_ROOT, 'dist')
  const distHooksDir = join(REPO_ROOT, 'dist-hooks')
  if (existsSync(distDir)) runtimeMirrorSources.push(distDir)
  if (existsSync(distHooksDir)) runtimeMirrorSources.push(distHooksDir)

  // package.json is small enough to embed as a GeneratedFile so it lands in the
  // atomic staging swap cleanly.
  const pkgJson = await readFile(join(REPO_ROOT, 'package.json'), 'utf-8')
  files.push({ relativePath: 'runtime/package.json', content: pkgJson })

  return { files, symlinks, runtimeMirrorSources }
}
