import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type {
  AdapterContext,
  GeneratedFiles,
  PlatformAdapter,
  VerifyResult,
} from '../interface.js'
import { generateClaudeCode } from './generate.js'

export const claudeCodeAdapter: PlatformAdapter = {
  name: 'claude-code',
  schemaVersion: 1,

  /**
   * Paths exclusively owned by the Claude Code adapter.
   * The cross-contamination guard refuses writes into these prefixes by any
   * other adapter unless `--allow-cross-target` is passed.
   */
  ownedPathPrefixes: ['.claude-plugin/', '.claude/'],

  capabilities: {
    // ANV-0037 — Claude Code natively speaks MCP.
    supportsSkillMcp: true,
  },

  async detect(): Promise<boolean> {
    try {
      execSync('which claude 2>/dev/null', { stdio: 'ignore' })
      return true
    } catch {
      const home = process.env.HOME ?? ''
      return (
        existsSync(join(home, '.claude')) ||
        existsSync(join(home, '.local/bin/claude'))
      )
    }
  },

  generate(ctx: AdapterContext): Promise<GeneratedFiles> {
    return generateClaudeCode(ctx)
  },

  async verify(ctx: AdapterContext): Promise<VerifyResult> {
    const findings: VerifyResult['findings'] = []
    const root = ctx.scope === 'global' ? (ctx.home ?? '') : ctx.cwd
    if (!existsSync(join(root, '.claude-plugin', 'plugin.json'))) {
      findings.push({
        severity: 'error',
        message: '.claude-plugin/plugin.json missing',
      })
    }
    if (!existsSync(join(root, 'models.json'))) {
      findings.push({
        severity: 'warn',
        message: 'models.json missing',
      })
    }
    return {
      ok: findings.filter((f) => f.severity === 'error').length === 0,
      findings,
    }
  },
}
