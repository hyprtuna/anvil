export const HookExit = {
  SUCCESS: 0 as const,
  WARN: 1 as const,
  BLOCK: 2 as const,
}

export type HookExitCode = 0 | 1 | 2

export function describeExitCode(code: HookExitCode): string {
  switch (code) {
    case 0:
      return 'success'
    case 1:
      return 'warn (non-blocking)'
    case 2:
      return 'block (aborts action)'
  }
}
