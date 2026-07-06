import type { AdapterContext } from '../interface.js'

export interface AnvilMarketplace {
  $schema: string
  name: string
  description: string
  owner: { name: string }
  plugins: Array<{
    name: string
    description: string
    category: string
    source: string
    version: string
  }>
}

export function buildAnvilMarketplace(ctx: AdapterContext): AnvilMarketplace {
  return {
    $schema: 'https://anthropic.com/claude-code/marketplace.schema.json',
    name: 'anvil',
    description: 'Anvil local marketplace (one plugin: anvil)',
    owner: { name: 'Anvil' },
    plugins: [
      {
        name: 'anvil',
        description:
          'Language-aware, role-aware skill system for Claude Code and OpenCode',
        category: 'development',
        source: './plugins/claude-code',
        version: ctx.config.version ?? '0.0.0',
      },
    ],
  }
}
