export interface DetectorResult {
  detected: boolean
  confidence: number
  evidence: string[]
}

export interface LanguageResult extends DetectorResult {
  name: string
}

export type DetectorContext = {
  cwd: string
  files: string[]
  configFiles: Set<string>
}
