import { execSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { getUserHome } from '../../core/io/home.js'
import {
  ensureProjectDir,
  getProjectScopedPath,
} from '../../core/io/project-scoped-paths.js'
import { getSessionScopedPath } from '../../core/io/session-scoped-paths.js'
import {
  ObservabilityDirective,
  pickDirective,
  renderDirective,
} from '../../core/observability/index.js'
import { type Tier, render } from '../../core/statusline/render.js'
import { StatuslineInput } from '../../core/statusline/schema.js'
import { type GitInfo } from '../../core/statusline/shared.js'
import {
  type SubagentTask,
  renderSubagentBatch,
} from '../../core/statusline/subagent.js'

// ── Git info aggregator with per-tick memoization (ANV-0062) ─────────────────

/** Minimum milliseconds between two live git calls (one render tick). */
const MIN_DELTA_MS = 500

interface GitCache {
  info: GitInfo
  ts: number
}

/** Module-level memo keyed by cwd. */
const _gitCache = new Map<string, GitCache>()

/**
 * Parse git diff --shortstat HEAD output to extract added/removed counts.
 * Exported for unit tests.
 */
export function parseShortstat(stat: string): {
  added: number
  removed: number
} {
  const addedMatch = stat.match(/(\d+) insertion/)
  const removedMatch = stat.match(/(\d+) deletion/)
  return {
    added: addedMatch ? Number.parseInt(addedMatch[1], 10) : 0,
    removed: removedMatch ? Number.parseInt(removedMatch[1], 10) : 0,
  }
}

/**
 * Aggregate all git information needed by the rich renderer.
 * Results are memoized for MIN_DELTA_MS milliseconds per cwd to avoid forking
 * git on every 300ms tick.
 */
function aggregateGitInfo(cwd: string): GitInfo {
  if (!cwd) return { repoName: '', branch: '', added: 0, removed: 0 }

  const now = Date.now()
  const cached = _gitCache.get(cwd)
  if (cached && now - cached.ts < MIN_DELTA_MS) {
    return cached.info
  }

  const info = _readGitInfoLive(cwd)
  _gitCache.set(cwd, { info, ts: now })
  return info
}

/** Perform the actual git shell calls (not memoized). */
function _readGitInfoLive(cwd: string): GitInfo {
  let repoName = ''
  let branch = ''
  let added = 0
  let removed = 0

  try {
    const gitRoot = execSync(
      `git -C ${JSON.stringify(cwd)} rev-parse --show-toplevel`,
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 2000,
      },
    ).trim()
    if (gitRoot) {
      repoName = gitRoot.split('/').pop() ?? ''
    }
  } catch {
    // not a git repo or git unavailable
  }

  try {
    branch = execSync(
      `git -C ${JSON.stringify(cwd)} symbolic-ref --short HEAD`,
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 2000,
      },
    ).trim()
  } catch {
    try {
      branch = execSync(
        `git -C ${JSON.stringify(cwd)} rev-parse --short HEAD`,
        {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'ignore'],
          timeout: 2000,
        },
      ).trim()
    } catch {
      branch = ''
    }
  }

  try {
    const stat = execSync(
      `git -C ${JSON.stringify(cwd)} diff --shortstat HEAD`,
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 2000,
      },
    )
    const vel = parseShortstat(stat)
    added = vel.added
    removed = vel.removed
  } catch {
    // ignore
  }

  return { repoName, branch, added, removed }
}

export interface StatuslineCliOptions {
  tier?: string
}

/**
 * `anvil statusline` reads the CC stdin JSON and emits one rendered
 * line. Wired into ~/.claude/settings.json's statusLine.command by
 * the CC adapter when the user opts in. Plan 28 Phase C4.
 */
export async function statuslineCommand(
  opts: StatuslineCliOptions = {},
): Promise<void> {
  const raw = await readStdin()
  let parsed: ReturnType<typeof StatuslineInput.safeParse>
  try {
    parsed = StatuslineInput.safeParse(JSON.parse(raw))
  } catch {
    // Bad JSON — emit nothing rather than crash; the statusline goes blank.
    return
  }
  if (!parsed.success) {
    // Schema mismatch — emit nothing; the statusline goes blank.
    return
  }
  const input = parsed.data

  // Tier: --tier flag wins; otherwise read models.json → statusline.tier.
  const tier = (opts.tier ?? readConfiguredTier()) as Tier
  const template = readConfiguredTemplate()
  const cwd = input.workspace?.current_dir ?? input.cwd ?? ''

  // ANV-0062: aggregate git info once per tick; pass via gitInfo so the
  // renderer stays pure. The simple-renderer path still uses branch/dirty.
  const gitInfo = aggregateGitInfo(cwd)
  const dirty = readGitDirty(cwd)
  const activeSkill = await readActiveSkill(input.cwd, input.transcript_path)
  const base = render(tier, input, {
    branch: gitInfo.branch || undefined,
    dirty,
    active_skill: activeSkill,
    template,
    gitInfo,
  })
  // ANV-0023 — append the highest-severity observability directive
  // fragment (e.g. `[ctx 78%]`) when one is present in the runtime
  // payload on disk. The fragment uses ` | <fragment>` separator so
  // it appears at the end of the rendered line without disturbing the
  // pre-existing layout.
  const fragment = readObservabilityFragment(cwd)
  if (fragment.length > 0) {
    process.stdout.write(`${base} | ${fragment}`)
  } else {
    process.stdout.write(base)
  }
}

// ─── ANV-0023: observability directive fragment ──────────────────────────────

/**
 * Disk path for the merged statusline payload (planRun + observability).
 * Producers (plan-runner, observability hooks) write this file; the
 * statusline reads it once per render tick.
 */
function statuslinePayloadPath(cwd: string): string {
  return join(cwd, '.anvil', 'runtime', 'statusline-payload.json')
}

/**
 * Permissive schema — the payload is .passthrough() by design so this
 * reader only validates the `observability.directives` array shape it
 * needs.
 */
const PayloadShape = z
  .object({
    observability: z
      .object({ directives: z.array(ObservabilityDirective).default([]) })
      .partial()
      .optional(),
  })
  .passthrough()

/**
 * Read the merged payload off disk, pick the highest-severity
 * directive, and return its rendered fragment string. Returns the
 * empty string when no directive is present or the file is missing /
 * malformed. Never throws.
 */
function readObservabilityFragment(cwd: string): string {
  if (cwd.length === 0) return ''
  const path = statuslinePayloadPath(cwd)
  if (!existsSync(path)) return ''
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = PayloadShape.safeParse(JSON.parse(raw))
    if (!parsed.success) return ''
    const directives = parsed.data.observability?.directives ?? []
    const winner = pickDirective(directives)
    if (winner === undefined) return ''
    return renderDirective(winner).fragment
  } catch {
    return ''
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let buf = ''
    if (process.stdin.isTTY) {
      resolve('')
      return
    }
    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', (chunk) => {
      buf += chunk
    })
    process.stdin.on('end', () => resolve(buf))
  })
}

function readConfiguredTier(): Tier {
  // Try ~/.anvil/models.json first; fall back to the 'default' tier.
  const candidate = join(getUserHome(), '.anvil', 'models.json')
  if (!existsSync(candidate)) return 'default'
  try {
    const raw = readFileSync(candidate, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const sl = parsed.statusline
    if (
      sl &&
      typeof sl === 'object' &&
      typeof (sl as Record<string, unknown>).tier === 'string'
    ) {
      const t = (sl as Record<string, unknown>).tier as string
      if (t === 'minimal' || t === 'default' || t === 'maximal') return t
    }
  } catch {
    // ignore — fall back
  }
  return 'default'
}

/** Plan 34 A4 — read configured template from ~/.anvil/models.json. */
function readConfiguredTemplate(): 'simple' | 'rich' {
  const candidate = join(getUserHome(), '.anvil', 'models.json')
  if (!existsSync(candidate)) return 'rich'
  try {
    const raw = readFileSync(candidate, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const sl = parsed.statusline
    if (sl && typeof sl === 'object') {
      const t = (sl as Record<string, unknown>).template
      if (t === 'simple' || t === 'rich') return t
    }
  } catch {
    // ignore
  }
  return 'rich'
}

function readGitDirty(cwd: string): boolean {
  try {
    const out = execSync('git status --porcelain', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    return out.trim().length > 0
  } catch {
    return false
  }
}

async function readActiveSkill(
  cwd: string,
  transcriptPath?: string,
): Promise<string | undefined> {
  // ANV-0043: prefer session-scoped path when transcript_path is available.
  if (transcriptPath) {
    const sessionPath = getSessionScopedPath(transcriptPath, 'active-skill')
    if (existsSync(sessionPath)) {
      try {
        const raw = readFileSync(sessionPath, 'utf-8')
        const parsed = JSON.parse(raw) as Record<string, unknown>
        const name = parsed.name
        if (typeof name === 'string' && name.length > 0) return name
      } catch {
        // fall through to per-project path
      }
    }
  }
  // Per-project path (migrates legacy .anvil/active-skill.json on first ensure)
  try {
    await ensureProjectDir(cwd)
    const path = await getProjectScopedPath(cwd, 'active-skill')
    if (!existsSync(path)) return undefined
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const name = parsed.name
    if (typeof name === 'string' && name.length > 0) return name
  } catch {
    // ignore
  }
  return undefined
}

export interface StatuslineInstallOptions {
  shellScript?: boolean
}

/**
 * Plan 28 C6. `anvil statusline install` — opt-in wiring helper.
 *
 * Without flags this is a no-op (the TS renderer is wired by `anvil init`).
 * With `--shell-script` it copies the bash reference verbatim into
 * `~/.claude/statusline-command.sh` and chmod 755s it; the user is
 * expected to point `~/.claude/settings.json → statusLine.command` at it
 * manually if they prefer the external-script path. Doctor warns when
 * both are present so the user can pick one.
 */
export async function statuslineInstallCommand(
  opts: StatuslineInstallOptions = {},
): Promise<void> {
  if (!opts.shellScript) {
    console.log(
      'Nothing to do. The TS renderer is wired by `anvil init`. Use --shell-script to install the bash reference instead.',
    )
    return
  }
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, '..', '..', '..', 'templates', 'statusline.sh'),
    join(here, '..', '..', 'templates', 'statusline.sh'),
  ]
  const templatePath = candidates.find((p) => existsSync(p))
  if (!templatePath) {
    console.error(
      'statusline.sh template not found in any of:',
      candidates.join(', '),
    )
    process.exit(1)
  }
  const content = readFileSync(templatePath, 'utf-8')
  const dest = join(getUserHome(), '.claude', 'statusline-command.sh')
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, content, 'utf-8')
  chmodSync(dest, 0o755)
  console.log(`wrote ${dest}`)
  console.log(
    'Now point ~/.claude/settings.json → statusLine.command at this file (or remove the existing `anvil statusline` entry).',
  )
}

/**
 * Plan 29 Phase F1 — `anvil statusline subagent`.
 *
 * Reads CC's subagent payload from stdin (a JSON object with a `tasks`
 * array), renders one `{id, content}` JSON line per task, and writes them
 * to stdout. Each line is a separate JSON object (newline-delimited).
 *
 * CC contract: `subagentStatusLine.command` receives a JSON payload on
 * stdin; the command emits one `{id, content}` JSON object per line.
 */
export async function statuslineSubagentCommand(): Promise<void> {
  const raw = await readStdin()
  if (!raw.trim()) return

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    // Bad JSON — emit nothing; CC treats silence as "no update".
    return
  }

  const tasks = extractTasks(payload)
  const lines = renderSubagentBatch(tasks)
  for (const line of lines) {
    process.stdout.write(`${JSON.stringify(line)}\n`)
  }
}

function extractTasks(payload: unknown): SubagentTask[] {
  if (typeof payload !== 'object' || payload === null) return []
  const p = payload as Record<string, unknown>
  const raw = p.tasks
  if (!Array.isArray(raw)) return []
  const result: SubagentTask[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const t = item as Record<string, unknown>
    if (typeof t.id !== 'string' || typeof t.name !== 'string') continue
    result.push({
      id: t.id,
      name: t.name,
      type: typeof t.type === 'string' ? t.type : undefined,
      status: typeof t.status === 'string' ? t.status : undefined,
      description:
        typeof t.description === 'string' ? t.description : undefined,
      label: typeof t.label === 'string' ? t.label : undefined,
      startTime:
        typeof t.startTime === 'string' || typeof t.startTime === 'number'
          ? (t.startTime as string | number)
          : undefined,
      tokenCount: typeof t.tokenCount === 'number' ? t.tokenCount : undefined,
      tokenSamples: Array.isArray(t.tokenSamples)
        ? (t.tokenSamples as number[])
        : undefined,
      cwd: typeof t.cwd === 'string' ? t.cwd : undefined,
    })
  }
  return result
}
