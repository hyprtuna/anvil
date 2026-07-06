import type { AdapterContext } from '../adapters/interface.js'
import { selectAdapters } from '../adapters/load-all.js'
import type { Target } from '../core/types.js'

export interface VerifySummary {
  ok: boolean
  findings: Array<{
    adapter: string
    severity: 'error' | 'warn'
    message: string
  }>
}

export async function verifyInstall(
  ctx: AdapterContext,
  target: Target,
): Promise<VerifySummary> {
  const adapters = selectAdapters(target)
  const findings: VerifySummary['findings'] = []
  for (const adapter of adapters) {
    const result = await adapter.verify(ctx)
    for (const f of result.findings) {
      findings.push({
        adapter: adapter.name,
        severity: f.severity,
        message: f.message,
      })
    }
  }
  return {
    ok: findings.filter((f) => f.severity === 'error').length === 0,
    findings,
  }
}
