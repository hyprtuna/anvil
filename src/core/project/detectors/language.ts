import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { LanguageResult } from '../stack.js'

interface LanguageSignal {
  name: string
  configFiles: string[]
  fileExtensions: string[]
}

const SIGNALS: LanguageSignal[] = [
  {
    name: 'typescript',
    configFiles: ['tsconfig.json', 'tsconfig.build.json'],
    fileExtensions: ['.ts', '.tsx', '.mts', '.cts'],
  },
  {
    name: 'javascript',
    configFiles: ['package.json'],
    fileExtensions: ['.js', '.jsx', '.mjs', '.cjs'],
  },
  {
    name: 'python',
    configFiles: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile'],
    fileExtensions: ['.py'],
  },
  {
    name: 'php',
    configFiles: ['composer.json', 'composer.lock'],
    fileExtensions: ['.php'],
  },
  { name: 'go', configFiles: ['go.mod', 'go.sum'], fileExtensions: ['.go'] },
  {
    name: 'rust',
    configFiles: ['Cargo.toml', 'Cargo.lock'],
    fileExtensions: ['.rs'],
  },
  {
    name: 'java',
    configFiles: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    fileExtensions: ['.java'],
  },
  {
    name: 'kotlin',
    configFiles: ['build.gradle.kts'],
    fileExtensions: ['.kt', '.kts'],
  },
  {
    name: 'ruby',
    configFiles: ['Gemfile', 'Gemfile.lock', '.ruby-version'],
    fileExtensions: ['.rb'],
  },
]

export async function detectLanguages(cwd: string): Promise<LanguageResult[]> {
  const files = await safeReaddir(cwd)
  const fileSet = new Set(files)

  const results: LanguageResult[] = []
  for (const signal of SIGNALS) {
    const evidence: string[] = []
    let confidence = 0

    for (const cfg of signal.configFiles) {
      if (fileSet.has(cfg)) {
        evidence.push(cfg)
        confidence += 0.5
      }
    }

    const extMatches = new Set<string>()
    for (const file of files) {
      for (const ext of signal.fileExtensions) {
        if (file.endsWith(ext)) extMatches.add(ext)
      }
    }
    if (extMatches.size > 0) {
      evidence.push(...[...extMatches].map((e) => `*${e} files`))
      confidence += Math.min(0.5, extMatches.size * 0.1)
    }

    results.push({
      name: signal.name,
      detected: confidence > 0,
      confidence: Math.min(1, confidence),
      evidence,
    })
  }

  // TS detected → reduce JS confidence (TS projects have .js in node_modules etc.)
  const ts = results.find((r) => r.name === 'typescript')
  const js = results.find((r) => r.name === 'javascript')
  if (ts && ts.confidence > 0.3 && js) {
    js.confidence = Math.max(0, js.confidence - 0.4)
  }

  // Boost TypeScript confidence if typescript dep in package.json
  if (fileSet.has('package.json') && existsSync(join(cwd, 'package.json'))) {
    try {
      const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf-8'))
      const deps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      }
      if (deps.typescript || deps['@types/node']) {
        const tsResult = results.find((r) => r.name === 'typescript')
        if (tsResult) {
          tsResult.confidence = Math.min(1, tsResult.confidence + 0.3)
          tsResult.evidence.push('package.json → typescript dep')
        }
      }
    } catch {
      /* invalid JSON — ignore */
    }
  }

  return results.filter((r) => r.confidence > 0 || r.detected)
}

async function safeReaddir(path: string): Promise<string[]> {
  try {
    return await readdir(path)
  } catch {
    return []
  }
}
