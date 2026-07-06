import { mkdir, symlink, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { getUserHome } from '../core/io/home.js'

export interface LinkCliOptions {
  anvilHome: string
}

export interface LinkCliResult {
  linkPath: string
  target: string
  created: boolean
}

/**
 * Create (or replace) `~/.local/bin/anvil → <anvilHome>/bin/anvil.cjs`.
 * Idempotent: removes any existing entry before linking.
 */
export async function linkCli({
  anvilHome,
}: LinkCliOptions): Promise<LinkCliResult> {
  const linkPath = join(getUserHome(), '.local', 'bin', 'anvil')
  const target = join(anvilHome, 'bin', 'anvil.cjs')
  await mkdir(join(getUserHome(), '.local', 'bin'), { recursive: true })
  await unlink(linkPath).catch(() => {})
  await symlink(target, linkPath)
  return { linkPath, target, created: true }
}
