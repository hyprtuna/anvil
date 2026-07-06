import { execSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

export interface NoteOptions {
  cwd?: string
  args?: string[]
}

/**
 * Zero-friction idea capture.
 *
 * Subcommands:
 *   anvil note "<text>"        → append a timestamped note under .anvil/notes/
 *   anvil note list            → list existing notes, newest first
 *   anvil note promote <file>  → emit a Markdown todo block for the note
 *
 * Lightweight note-taking CLI.
 * Returns a value for programmatic use by tests; prints human-readable output
 * for CLI users.
 */
export async function noteCommand(
  opts: NoteOptions = {},
): Promise<string | string[] | null> {
  const cwd = opts.cwd ?? process.cwd()
  const args = opts.args ?? []

  if (args.length === 0) {
    console.log('Usage:')
    console.log('  anvil note "<text>"        capture a quick idea')
    console.log('  anvil note list            show saved notes')
    console.log('  anvil note promote <file>  convert a note to a todo')
    return null
  }

  const sub = args[0]
  if (sub === 'list') return listNotes(cwd)
  if (sub === 'promote') {
    if (args.length < 2) {
      console.log('Usage: anvil note promote <file>')
      return null
    }
    return promoteNote(args[1])
  }

  // default: append
  const text = args.join(' ').trim()
  if (text.length === 0) {
    console.log('Usage: anvil note "<text>"')
    return null
  }
  return appendNote(cwd, text)
}

function appendNote(cwd: string, text: string): string {
  const notesDir = join(cwd, '.anvil', 'notes')
  if (!existsSync(notesDir)) mkdirSync(notesDir, { recursive: true })

  const now = new Date()
  const stamp = `${now.toISOString().replace(/[:T]/g, '-').replace(/\..+$/, '').slice(0, 19)}-${String(now.getMilliseconds()).padStart(3, '0')}`
  const path = join(notesDir, `${stamp}.md`)

  let branch = ''
  try {
    branch = execSync('git branch --show-current', {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    /* not a git repo */
  }

  const body = [
    '---',
    `created: ${now.toISOString()}`,
    branch ? `branch: ${branch}` : null,
    `cwd: ${cwd}`,
    '---',
    '',
    text,
    '',
  ]
    .filter((l) => l !== null)
    .join('\n')
  writeFileSync(path, body)
  console.log(`Note saved: ${path}`)
  return path
}

function listNotes(cwd: string): string[] {
  const notesDir = join(cwd, '.anvil', 'notes')
  if (!existsSync(notesDir)) {
    console.log('No notes yet.')
    return []
  }
  const entries = readdirSync(notesDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(notesDir, f))
    .sort()
    .reverse() // filename includes timestamp → reverse = newest first
  for (const p of entries) console.log(p)
  return entries
}

function promoteNote(file: string): string {
  if (!existsSync(file)) {
    console.log(`Not found: ${file}`)
    return ''
  }
  const raw = readFileSync(file, 'utf-8')
  // Strip simple frontmatter.
  const stripped = raw.replace(/^---\n[\s\S]*?\n---\n\n?/, '').trim()
  const firstLine = stripped.split('\n')[0] ?? ''
  const todo = `- [ ] ${firstLine}`
  const rest = stripped.split('\n').slice(1).join('\n').trim()
  const block = rest
    ? `${todo}\n\n  ${rest.replace(/\n/g, '\n  ')}\n`
    : `${todo}\n`
  process.stdout.write(block)
  return block
}
