import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface RunnerResult {
  name: string
  detected: boolean
  confidence: number
  evidence: string[]
}

interface RunnerSignal {
  name: string
  packages?: string[]
  configFiles?: string[]
}

const RUNNERS: RunnerSignal[] = [
  {
    name: 'vitest',
    packages: ['vitest'],
    configFiles: ['vitest.config.ts', 'vitest.config.js'],
  },
  {
    name: 'jest',
    packages: ['jest'],
    configFiles: ['jest.config.ts', 'jest.config.js', 'jest.config.cjs'],
  },
  {
    name: 'playwright',
    packages: ['@playwright/test'],
    configFiles: ['playwright.config.ts'],
  },
  {
    name: 'cypress',
    packages: ['cypress'],
    configFiles: ['cypress.config.ts'],
  },
  { name: 'pytest', packages: ['pytest'], configFiles: ['pytest.ini'] },
  {
    name: 'phpunit',
    packages: ['phpunit/phpunit'],
    configFiles: ['phpunit.xml', 'phpunit.xml.dist'],
  },
  { name: 'pest', packages: ['pestphp/pest'] },
  { name: 'go-test', configFiles: ['go.mod'] },
  { name: 'cargo-test', configFiles: ['Cargo.toml'] },
  { name: 'rspec', packages: ['rspec'], configFiles: ['.rspec'] },
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

export async function detectTestRunners(cwd: string): Promise<RunnerResult[]> {
  const packageJson = await readJsonSafe<PackageJsonDeps>(
    join(cwd, 'package.json'),
  )
  const composerJson = await readJsonSafe<ComposerJsonDeps>(
    join(cwd, 'composer.json'),
  )
  const pyProject = await readTextSafe(join(cwd, 'pyproject.toml'))
  const requirements = await readTextSafe(join(cwd, 'requirements.txt'))
  const gemfile = await readTextSafe(join(cwd, 'Gemfile'))

  const results: RunnerResult[] = []
  for (const r of RUNNERS) {
    const evidence: string[] = []
    let confidence = 0

    if (r.configFiles) {
      for (const cfg of r.configFiles) {
        if (existsSync(join(cwd, cfg))) {
          evidence.push(cfg)
          confidence = Math.max(confidence, 0.8)
        }
      }
    }
    if (r.packages) {
      for (const pkg of r.packages) {
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
        if (gemfile?.includes(pkg)) {
          evidence.push(`Gemfile → ${pkg}`)
          confidence = 1
        }
      }
    }

    if (confidence > 0)
      results.push({ name: r.name, detected: true, confidence, evidence })
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
