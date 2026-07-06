import { existsSync } from 'node:fs'
import { readlink, rm, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { getUserHome } from '../core/io/home.js'
import { buildContextFromRepo } from './context-from-repo.js'
import { linkCli } from './link-cli.js'
import { detectV1Residue } from './residue.js'
import { syncAnvilHome } from './sync.js'
import { type Target, applyTargets, unapplyTargets } from './wire.js'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'from-local': { type: 'string' },
    // NOTE: --from-git and --from-archive are intentionally omitted (ANV-0011).
    // The implementation in context-from-repo.ts throws "not implemented".
    // These flags will be re-exposed once safe-pack-extraction tests land.
    'claude-code-user': { type: 'boolean' },
    'claude-code-project': { type: 'boolean' },
    'opencode-user': { type: 'boolean' },
    'opencode-project': { type: 'boolean' },
    all: { type: 'boolean' },
    none: { type: 'boolean' },
    cli: { type: 'boolean' },
    prefix: { type: 'string' },
    'dry-run': { type: 'boolean' },
    force: { type: 'boolean' },
    verbose: { type: 'boolean' },
  },
})

const command = positionals[0] ?? 'install' // 'install' | 'uninstall' | 'purge'

function resolveTargets(): Target[] {
  if (values.none) return []
  if (values.all) return ['cc-user', 'cc-project', 'oc-user', 'oc-project']
  const t: Target[] = []
  if (values['claude-code-user']) t.push('cc-user')
  if (values['claude-code-project']) t.push('cc-project')
  if (values['opencode-user']) t.push('oc-user')
  if (values['opencode-project']) t.push('oc-project')
  return t.length ? t : ['cc-user', 'oc-user']
}

async function main(): Promise<void> {
  const anvilHome = values.prefix ?? join(getUserHome(), '.anvil')

  const fromCount = [values['from-local']].filter(Boolean).length
  if (fromCount > 1) {
    console.error('anvil: only one --from-* flag may be specified at a time')
    process.exit(1)
  }

  if (command === 'install') {
    if (!values.force) {
      const residue = await detectV1Residue(getUserHome(), process.cwd())
      if (residue.length) {
        console.error('anvil: v1 residue detected:')
        for (const f of residue) console.error(`  - ${f.path}: ${f.reason}`)
        console.error(
          'Re-run with --force to override, or run ./uninstall.sh --all --purge first.',
        )
        process.exit(3)
      }
    }

    const ctx = await buildContextFromRepo({
      sourceKind: 'local',
      sourceValue: values['from-local'] ?? process.cwd(),
    })
    await syncAnvilHome({ ctx, target: anvilHome })
    const targets = resolveTargets()
    const results = await applyTargets(targets, {
      anvilHome,
      projectRoot: process.cwd(),
    })

    if (values.cli) {
      const res = await linkCli({ anvilHome })
      console.log(`created symlink ${res.linkPath} -> ${res.target}`)
    }

    console.log(`\nAnvil installed to ${anvilHome}`)
    for (const [target, result] of Object.entries(results)) {
      const actions = (result as { actions?: string[] }).actions ?? []
      if (actions.length) {
        console.log(`  [${target}] ${actions.join(', ')}`)
      } else {
        console.log(`  [${target}] already up-to-date`)
      }
    }
    console.log('\nDone. Run `anvil doctor` to verify.')
  } else if (command === 'uninstall') {
    const targets = resolveTargets()
    const results = await unapplyTargets(targets, {
      anvilHome,
      projectRoot: process.cwd(),
    })

    if (values.cli) {
      const cliLink = join(getUserHome(), '.local', 'bin', 'anvil')
      if (existsSync(cliLink)) {
        const target = await readlink(cliLink).catch(() => '')
        if (target.startsWith(`${anvilHome}/`)) {
          await unlink(cliLink).catch(() => {})
          console.log(`removed symlink ${cliLink}`)
        }
      }
    }

    console.log(`\nAnvil uninstalled from ${anvilHome}`)
    for (const [target, result] of Object.entries(results)) {
      const actions = (result as { actions?: string[] }).actions ?? []
      if (actions.length) console.log(`  [${target}] ${actions.join(', ')}`)
    }
  } else if (command === 'purge') {
    await unapplyTargets(['cc-user', 'cc-project', 'oc-user', 'oc-project'], {
      anvilHome,
      projectRoot: process.cwd(),
    })
    await rm(anvilHome, { recursive: true, force: true })
    console.log(`purged ${anvilHome}`)

    // Clean up v1 residue files (plugin.json, opencode.json with old schema)
    const residue = await detectV1Residue(getUserHome(), process.cwd())
    for (const finding of residue) {
      await unlink(finding.path).catch(() => {})
      console.log(`removed v1 residue: ${finding.path}`)
    }
  } else {
    console.error(`unknown command: ${command}`)
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  const message =
    err instanceof Error ? (err.stack ?? err.message) : String(err)
  console.error(message)
  process.exit(1)
})
