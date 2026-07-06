import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { isBinaryOnPath } from '../../core/util/path-binary.js'
import type {
  AdapterContext,
  GeneratedFiles,
  PlatformAdapter,
  VerifyResult,
} from '../interface.js'
import { generateOpenCode } from './generate.js'

export const opencodeAdapter: PlatformAdapter = {
  name: 'opencode',
  schemaVersion: 1,

  /**
   * Paths exclusively owned by the OpenCode adapter.
   * The cross-contamination guard refuses writes into these prefixes by any
   * other adapter unless `--allow-cross-target` is passed.
   */
  ownedPathPrefixes: ['.opencode/', 'plugins/opencode/'],

  capabilities: {
    // ANV-0037 — OpenCode natively speaks MCP.
    supportsSkillMcp: true,
  },

  async detect(): Promise<boolean> {
    return isBinaryOnPath('opencode')
  },

  generate(ctx: AdapterContext): Promise<GeneratedFiles> {
    return generateOpenCode(ctx)
  },

  async verify(ctx: AdapterContext): Promise<VerifyResult> {
    const findings: VerifyResult['findings'] = []
    const root = ctx.scope === 'global' ? (ctx.home ?? '') : ctx.cwd
    if (!existsSync(join(root, 'plugins', 'opencode', 'package.json'))) {
      findings.push({
        severity: 'error',
        message: 'plugins/opencode/package.json missing',
      })
    }
    return {
      ok: findings.filter((f) => f.severity === 'error').length === 0,
      findings,
    }
  },
}
