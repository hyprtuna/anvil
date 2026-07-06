import {
  ClaudeCodePluginManifest,
  type ClaudeCodePluginManifestT,
  HOOK_KIND_TO_EVENT,
  PLUGIN_MANIFEST_SCHEMA_URL,
} from '../../core/manifest-schema/claude-code.js'
import { getPackageVersion } from '../../core/package-meta.js'
import type { AdapterContext } from '../interface.js'

const PLUGIN_ROOT = '${CLAUDE_PLUGIN_ROOT}'

export function buildPluginManifest(
  ctx: AdapterContext,
): ClaudeCodePluginManifestT {
  const hooks: NonNullable<ClaudeCodePluginManifestT['hooks']> = {}

  for (const h of ctx.hooks) {
    if (!h.enabled) continue
    const event = HOOK_KIND_TO_EVENT[h.kind]
    if (!event) continue
    // Plan 28 D5. Surface optional matcher / if-rules from the hook
    // definition into the plugin manifest so CC's own dispatcher filters
    // before invoking — saves a process spawn for every irrelevant tool.
    const entry: {
      matcher: string
      if?: string | string[]
      hooks: Array<{ type: 'command'; command: string }>
    } = {
      matcher: h.matcher ?? '',
      hooks: [
        {
          type: 'command' as const,
          command: `${PLUGIN_ROOT}/hooks/${h.kind}.cjs`,
        },
      ],
    }
    if (h.ifRules !== undefined) entry.if = h.ifRules
    const list = hooks[event] ?? []
    list.push(entry)
    hooks[event] = list
  }

  const manifest: ClaudeCodePluginManifestT = {
    $schema: PLUGIN_MANIFEST_SCHEMA_URL,
    schemaVersion: 1,
    name: 'anvil',
    version: getPackageVersion(),
    description: 'Language-aware skill system for Claude Code and OpenCode',
    author: {
      name: 'Anvil maintainers',
      url: 'https://github.com/anvilhq/anvil',
    },
    license: 'MIT',
    keywords: ['claude-code', 'skills', 'hooks', 'plugin', 'anvil'],
    hooks: Object.keys(hooks).length > 0 ? hooks : undefined,
  }
  return ClaudeCodePluginManifest.parse(manifest)
}

export interface MarketplaceManifest {
  name: string
  owner: { name: string; email?: string; url?: string }
  plugins: Array<{
    name: string
    source: string
    description: string
    version: string
    keywords?: string[]
  }>
}

export function buildMarketplaceManifest(): MarketplaceManifest {
  return {
    name: 'anvil',
    owner: { name: 'Anvil maintainers' },
    plugins: [
      {
        name: 'anvil',
        source: './',
        description:
          'Language-aware, role-aware skill system for Claude Code and OpenCode',
        version: getPackageVersion(),
        keywords: ['claude', 'claude-code', 'skills', 'hooks', 'plugin'],
      },
    ],
  }
}
