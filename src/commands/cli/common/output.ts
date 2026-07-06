import type { EffortLevel } from '../../../core/types.js'

export type ColorName = 'red' | 'yellow' | 'cyan' | 'green' | 'gray' | 'white'

export function modelColor(model: string): ColorName {
  if (model.includes('opus')) return 'red'
  if (model.includes('sonnet')) return 'yellow'
  if (model.includes('haiku')) return 'cyan'
  return 'white'
}

export function effortColor(effort: EffortLevel | undefined): ColorName {
  switch (effort) {
    case 'max':
      return 'red'
    case 'xhigh':
      return 'yellow'
    case 'high':
      return 'yellow'
    case 'medium':
      return 'green'
    case 'low':
      return 'gray'
    default:
      return 'gray'
  }
}
