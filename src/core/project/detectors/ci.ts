import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface CIResult {
  name: string
  confidence: number
  evidence: string[]
}

const CI_SIGNALS: Array<{ name: string; paths: string[] }> = [
  { name: 'github-actions', paths: ['.github/workflows'] },
  { name: 'gitlab-ci', paths: ['.gitlab-ci.yml'] },
  { name: 'circleci', paths: ['.circleci/config.yml'] },
  { name: 'travis', paths: ['.travis.yml'] },
  { name: 'jenkins', paths: ['Jenkinsfile'] },
  { name: 'bitbucket-pipelines', paths: ['bitbucket-pipelines.yml'] },
  { name: 'azure-devops', paths: ['azure-pipelines.yml'] },
]

export function detectCI(cwd: string): CIResult[] {
  const results: CIResult[] = []
  for (const { name, paths } of CI_SIGNALS) {
    for (const p of paths) {
      if (existsSync(join(cwd, p))) {
        results.push({ name, confidence: 1, evidence: [p] })
        break
      }
    }
  }
  return results
}
