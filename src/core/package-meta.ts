import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

let cached: { name: string; version: string } | undefined

function loadPackageJson(): { name: string; version: string } {
  // Resolves both from src/core/ (dev via tsx) and dist/core/ (prod).
  // Both directories are two levels below the repo root.
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(here, '../../package.json'),
    resolve(here, '../../../package.json'),
  ]
  for (const path of candidates) {
    try {
      const raw = readFileSync(path, 'utf-8')
      const parsed = JSON.parse(raw) as { name?: string; version?: string }
      if (typeof parsed.version !== 'string' || parsed.version.length === 0) {
        continue
      }
      return {
        name: typeof parsed.name === 'string' ? parsed.name : 'anvil',
        version: parsed.version,
      }
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    'package-meta: unable to resolve package.json from any known candidate path',
  )
}

export function getPackageMeta(): { name: string; version: string } {
  if (!cached) cached = loadPackageJson()
  return cached
}

export function getPackageVersion(): string {
  return getPackageMeta().version
}

export function getPackageName(): string {
  return getPackageMeta().name
}
