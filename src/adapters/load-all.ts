import type { Target } from '../core/types.js'
import { claudeCodeAdapter } from './claude-code/adapter.js'
import type { PlatformAdapter } from './interface.js'
import { opencodeAdapter } from './opencode/adapter.js'

export function selectAdapters(target: Target): PlatformAdapter[] {
  switch (target) {
    case 'claude-code':
      return [claudeCodeAdapter]
    case 'opencode':
      return [opencodeAdapter]
    case 'both':
      return [claudeCodeAdapter, opencodeAdapter]
  }
}
