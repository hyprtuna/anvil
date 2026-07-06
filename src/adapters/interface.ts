import type { RegisteredHook } from '../core/registry/hook-registry.js'
import type {
  Agent,
  ModelsConfig,
  Scope,
  Skill,
  Target,
} from '../core/types.js'

export interface GeneratedFile {
  relativePath: string
  content: string | Buffer
  executable?: boolean
}

export interface GeneratedSymlink {
  linkPath: string
  target: string
}

export interface GeneratedFiles {
  adapterName: 'claude-code' | 'opencode'
  installRoot: string
  files: GeneratedFile[]
  symlinks?: GeneratedSymlink[]
}

export interface AdapterContext {
  cwd: string
  home?: string
  scope: Scope
  config: ModelsConfig
  skills: Skill[]
  hooks: RegisteredHook[]
  agents: Agent[]
}

export interface VerifyResult {
  ok: boolean
  findings: Array<{ severity: 'error' | 'warn'; message: string }>
}

/**
 * ANV-0037 — Per-adapter capability flags. Additive — adapters that omit a
 * field default to `false`. Currently used to gate skill-declared MCP servers:
 * an adapter with `supportsSkillMcp: false` triggers a doctor warning when
 * skills declare `mcp_servers`. Both CC and OC speak MCP and set this true.
 */
export interface AdapterCapabilities {
  supportsSkillMcp?: boolean
}

export interface PlatformAdapter {
  name: 'claude-code' | 'opencode'
  schemaVersion: 1
  /**
   * Filesystem path prefixes exclusively owned by this adapter.
   * The cross-contamination guard uses this list to refuse plan operations
   * when a different adapter attempts to write into another adapter's territory.
   *
   * Prefixes are relative (e.g. `.claude-plugin/`) so they work regardless of
   * whether the install root is a project directory or the user's home.
   */
  ownedPathPrefixes: string[]
  /** ANV-0037 — optional capability flags surfaced to the doctor. */
  capabilities?: AdapterCapabilities
  detect(): Promise<boolean>
  generate(ctx: AdapterContext): Promise<GeneratedFiles>
  verify(ctx: AdapterContext): Promise<VerifyResult>
}

export interface RunResult {
  scope: Scope
  target: Target
  filesWritten: string[]
  filesRemoved: string[]
  warnings: string[]
}
