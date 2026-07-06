import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

/**
 * A resolved lint root — one directory to scan for skill/agent/hook files.
 */
export interface LintTarget {
  kind: 'skill' | 'agent' | 'hook'
  root: string
}

const LintRootsOptsSchema = z.object({
  kind: z.enum(['skill', 'agent', 'hook']),
  cwd: z.string().min(1),
  anvilHome: z.string().min(1),
  target: z.string().optional(),
})

type LintRootsOpts = z.infer<typeof LintRootsOptsSchema>

/**
 * Resolve the set of directories to lint for a given surface kind.
 *
 * Resolution order (project-closest first):
 *  1. If `opts.target` is supplied: validate it exists and return it alone.
 *  2. Otherwise, collect existing-only from:
 *     a. `<cwd>/.claude/<kind>s`   (project-local user content)
 *     b. `<anvilHome>/<kind>s`     (user pack directory)
 *
 * Returns an empty array when no roots exist (caller handles the "nothing to
 * lint" case gracefully rather than erroring).
 *
 * @throws {Error} When `opts.target` is supplied but the path does not exist.
 */
export function resolveLintRoots(opts: LintRootsOpts): LintTarget[] {
  const parsed = LintRootsOptsSchema.parse(opts)
  const { kind, cwd, anvilHome, target } = parsed

  // Directory name is the pluralised kind.
  const dirName = `${kind}s`

  if (target !== undefined) {
    if (!existsSync(target)) {
      throw new Error(`[lint-roots] --target path does not exist: ${target}`)
    }
    return [{ kind, root: target }]
  }

  const candidates: LintTarget[] = [
    { kind, root: join(cwd, '.claude', dirName) },
    { kind, root: join(anvilHome, dirName) },
  ]

  return candidates.filter((c) => existsSync(c.root))
}
