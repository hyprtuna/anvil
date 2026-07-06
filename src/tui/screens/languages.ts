import { note } from '@clack/prompts'
import { detectProject } from '../../core/project/detect.js'

export async function runLanguagesScreen(): Promise<void> {
  const project = await detectProject(process.cwd())
  const top = project.languages.filter((l) => l.confidence > 0.3).slice(0, 3)
  const summary =
    top.length > 0
      ? top
          .map((l) => `  • ${l.name} (${Math.round(l.confidence * 100)}%)`)
          .join('\n')
      : '  • no languages detected'
  note(summary, 'Detected stack')
}
