import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface FrameworkResult {
  name: string
  detected: boolean
  confidence: number
  evidence: string[]
}

interface FrameworkSignal {
  name: string
  packages?: string[]
  configFiles?: string[]
}

const FRAMEWORKS: FrameworkSignal[] = [
  { name: 'next.js', packages: ['next'] },
  { name: 'react', packages: ['react'] },
  { name: 'vue', packages: ['vue'] },
  { name: 'svelte', packages: ['svelte'] },
  { name: 'express', packages: ['express'] },
  { name: 'fastify', packages: ['fastify'] },
  { name: 'nestjs', packages: ['@nestjs/core'] },
  { name: 'laravel', configFiles: ['artisan'] },
  { name: 'symfony', configFiles: ['symfony.lock'] },
  { name: 'django', configFiles: ['manage.py'] },
  { name: 'fastapi', packages: ['fastapi'] },
  { name: 'flask', packages: ['flask'] },
  { name: 'gin', packages: ['github.com/gin-gonic/gin'] },
  { name: 'actix-web', packages: ['actix-web'] },
  { name: 'rails', configFiles: ['config/routes.rb'] },
]

type DepsMap = Record<string, string>

interface PackageJsonDeps {
  dependencies?: DepsMap
  devDependencies?: DepsMap
}

interface ComposerJsonDeps {
  require?: DepsMap
  'require-dev'?: DepsMap
}

function hasDep(deps: PackageJsonDeps | undefined, pkg: string): boolean {
  return Boolean(deps?.dependencies?.[pkg] ?? deps?.devDependencies?.[pkg])
}

function hasComposerDep(
  deps: ComposerJsonDeps | undefined,
  pkg: string,
): boolean {
  return Boolean(deps?.require?.[pkg] ?? deps?.['require-dev']?.[pkg])
}

export async function detectFrameworks(
  cwd: string,
): Promise<FrameworkResult[]> {
  const packageJson = await readJsonSafe<PackageJsonDeps>(
    join(cwd, 'package.json'),
  )
  const composerJson = await readJsonSafe<ComposerJsonDeps>(
    join(cwd, 'composer.json'),
  )
  const pyProject = await readTextSafe(join(cwd, 'pyproject.toml'))
  const requirements = await readTextSafe(join(cwd, 'requirements.txt'))
  const goMod = await readTextSafe(join(cwd, 'go.mod'))
  const cargoToml = await readTextSafe(join(cwd, 'Cargo.toml'))
  const gemfile = await readTextSafe(join(cwd, 'Gemfile'))

  const results: FrameworkResult[] = []
  for (const fw of FRAMEWORKS) {
    const evidence: string[] = []
    let confidence = 0

    if (fw.packages) {
      for (const pkg of fw.packages) {
        if (hasDep(packageJson, pkg)) {
          evidence.push(`package.json → ${pkg}`)
          confidence = 1
        }
        if (hasComposerDep(composerJson, pkg)) {
          evidence.push(`composer.json → ${pkg}`)
          confidence = 1
        }
        if (pyProject?.includes(pkg) || requirements?.includes(pkg)) {
          evidence.push(`python deps → ${pkg}`)
          confidence = 1
        }
        if (goMod?.includes(pkg)) {
          evidence.push(`go.mod → ${pkg}`)
          confidence = 1
        }
        if (cargoToml?.includes(pkg)) {
          evidence.push(`Cargo.toml → ${pkg}`)
          confidence = 1
        }
        if (gemfile?.includes(pkg)) {
          evidence.push(`Gemfile → ${pkg}`)
          confidence = 1
        }
      }
    }

    if (fw.configFiles) {
      for (const cfg of fw.configFiles) {
        if (existsSync(join(cwd, cfg))) {
          evidence.push(cfg)
          confidence = Math.max(confidence, 0.8)
        }
      }
    }

    if (confidence > 0)
      results.push({ name: fw.name, detected: true, confidence, evidence })
  }
  return results
}

async function readJsonSafe<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as T
  } catch {
    return undefined
  }
}
async function readTextSafe(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf-8')
  } catch {
    return undefined
  }
}
