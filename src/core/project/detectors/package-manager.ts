import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface PackageManagerResult {
  name: string
  confidence: number
  evidence: string[]
}

const LOCKFILES: Array<{ name: string; file: string }> = [
  { name: 'pnpm', file: 'pnpm-lock.yaml' },
  { name: 'yarn', file: 'yarn.lock' },
  { name: 'bun', file: 'bun.lockb' },
  { name: 'npm', file: 'package-lock.json' },
  { name: 'composer', file: 'composer.lock' },
  { name: 'poetry', file: 'poetry.lock' },
  { name: 'uv', file: 'uv.lock' },
  { name: 'cargo', file: 'Cargo.lock' },
  { name: 'bundler', file: 'Gemfile.lock' },
]

export function detectPackageManager(
  cwd: string,
): PackageManagerResult | undefined {
  for (const { name, file } of LOCKFILES) {
    if (existsSync(join(cwd, file))) {
      return { name, confidence: 1, evidence: [file] }
    }
  }
  return undefined
}
