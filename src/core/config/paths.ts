import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Scope } from '../types.js'

export interface ResolvedPaths {
  anvil: string
  claude: string
  opencode: string
  hasAnvilDir: boolean
  hasClaudeDir: boolean
  hasOpencodeDir: boolean
}

export interface ResolvePathsOptions {
  scope: Scope
  cwd: string
  home?: string
}

export function resolvePaths(opts: ResolvePathsOptions): ResolvedPaths {
  const base = opts.scope === 'global' ? (opts.home ?? homedir()) : opts.cwd
  const anvil = join(base, '.anvil')
  const claude = join(base, '.claude')
  const opencode = join(base, '.opencode')
  return {
    anvil,
    claude,
    opencode,
    hasAnvilDir: existsSync(anvil),
    hasClaudeDir: existsSync(claude),
    hasOpencodeDir: existsSync(opencode),
  }
}
