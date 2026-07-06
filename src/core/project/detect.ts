import type { ProjectContext } from '../types.js'
import { detectCI } from './detectors/ci.js'
import { detectFrameworks } from './detectors/framework.js'
import { detectLanguages } from './detectors/language.js'
import { detectPackageManager } from './detectors/package-manager.js'
import { detectTestRunners } from './detectors/test-runner.js'

/**
 * Runs all detectors in parallel and assembles a ProjectContext.
 * Each detector is independent — Promise.all is safe here.
 */
export async function detectProject(cwd: string): Promise<ProjectContext> {
  const [languages, frameworks, testRunners, ci] = await Promise.all([
    detectLanguages(cwd),
    detectFrameworks(cwd),
    detectTestRunners(cwd),
    detectCI(cwd),
  ])

  const packageManager = detectPackageManager(cwd)

  return {
    languages,
    frameworks: frameworks.map((f) => f.name),
    testRunners: testRunners.map((r) => r.name),
    packageManager: packageManager?.name,
    ci: ci.map((c) => c.name),
    detectedAt: new Date().toISOString(),
  }
}
