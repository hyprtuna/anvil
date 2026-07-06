import { execSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { HookHandler } from '../../core/types.js'
import { HookExit } from '../exit-codes.js'

// Conventional Commits subject regex.
// `<type>(<optional scope>)!?: <subject>` per https://www.conventionalcommits.org/.
const CONVENTIONAL_COMMIT_RE =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?!?:\s.+/
const CONVENTIONAL_COMMIT_TYPES =
  'feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert'

// Cheap secret-scan patterns. Deliberately small — this runs on every commit.
// Keep each regex bounded (no catastrophic backtracking) and anchored enough
// to avoid false positives on documentation samples.
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', pattern: /\bghp_[A-Za-z0-9]{36}\b/ },
  { name: 'GitHub OAuth', pattern: /\bgho_[A-Za-z0-9]{36}\b/ },
  { name: 'OpenAI API key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  {
    name: 'Anthropic API key',
    pattern: /\bsk-ant-(?:api\d+-)?[A-Za-z0-9_-]{20,}\b/,
  },
  { name: 'Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  {
    name: 'Private key block',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
]

const MAX_FILE_BYTES = 1_000_000 // 1MB — skip blobs

/**
 * Runs before git commit. Current checks:
 *   1. `npm run typecheck` (via `--if-present` so it no-ops when absent).
 *   2. Secret scan on staged files — fails the commit if a common credential
 *      pattern appears in any staged diff.
 *
 * DELIBERATELY does not run the full test suite. A past revision invoked
 * `npm test` from this handler, which then recursively spawned vitest inside
 * the test harness and exhausted memory/cpu on the development's machine.
 * Unit tests stay in CI; pre-commit stays fast.
 */
export const preCommitHandler: HookHandler = async (ctx) => {
  const checks: string[] = []

  // 1. Typecheck
  try {
    execSync('npm run typecheck --if-present', { cwd: ctx.cwd, stdio: 'pipe' })
    checks.push('typecheck: ok')
  } catch {
    return { exitCode: HookExit.BLOCK, message: 'pre-commit: typecheck failed' }
  }

  // 2. Secret scan — best-effort, skipped silently if git isn't available or
  //    the project isn't a git repo.
  try {
    const staged = listStagedFiles(ctx.cwd)
    const leaks = scanForSecrets(ctx.cwd, staged)
    if (leaks.length > 0) {
      return {
        exitCode: HookExit.BLOCK,
        message: `pre-commit: possible secret(s) detected — ${leaks.join(', ')}`,
      }
    }
    checks.push(`secret-scan: ${staged.length} file(s) clean`)
  } catch {
    // Non-fatal: if git failed or a file couldn't be read, just report the
    // partial success from typecheck. We never BLOCK on scanner errors.
    checks.push('secret-scan: skipped')
  }

  // 3. Conventional Commits enforcement (opt-in via env var).
  //    Validates the pending commit before it lands.
  if (process.env.ANVIL_ENFORCE_CONVENTIONAL_COMMITS === '1') {
    const verdict = checkConventionalCommit(ctx.cwd)
    if (verdict.kind === 'block')
      return { exitCode: HookExit.BLOCK, message: verdict.message }
    if (verdict.kind === 'ok') checks.push('commit-msg: ok')
    // 'skip' = no COMMIT_EDITMSG present (e.g. -m flag path); silently allow.
  }

  return { exitCode: HookExit.SUCCESS, message: checks.join(', ') }
}

type ConventionalVerdict =
  | { kind: 'ok' }
  | { kind: 'skip' }
  | { kind: 'block'; message: string }

function checkConventionalCommit(cwd: string): ConventionalVerdict {
  const editMsgPath = join(cwd, '.git', 'COMMIT_EDITMSG')
  if (!existsSync(editMsgPath)) return { kind: 'skip' }

  let raw: string
  try {
    const r = readFileSync(editMsgPath, 'utf-8') as unknown
    raw = Buffer.isBuffer(r) ? r.toString('utf-8') : (r as string)
  } catch {
    return { kind: 'skip' }
  }

  // Subject is the first non-comment, non-empty line.
  const subject = raw
    .split('\n')
    .map((l) => l.trimEnd())
    .find((l) => l.length > 0 && !l.startsWith('#'))

  if (!subject) return { kind: 'skip' }

  if (subject.length > 72) {
    return {
      kind: 'block',
      message: `pre-commit: commit subject exceeds 72 chars (got ${subject.length}). Subject: ${subject.slice(0, 80)}...`,
    }
  }
  if (!CONVENTIONAL_COMMIT_RE.test(subject)) {
    return {
      kind: 'block',
      message: `pre-commit: commit subject must be Conventional Commits format \`<type>(<scope>): <subject>\`. Valid types: ${CONVENTIONAL_COMMIT_TYPES}. Got: "${subject}"`,
    }
  }
  return { kind: 'ok' }
}

function listStagedFiles(cwd: string): string[] {
  const out = execSync('git diff --cached --name-only --diff-filter=ACMR', {
    cwd,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).toString('utf-8')
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function scanForSecrets(cwd: string, files: string[]): string[] {
  const hits: string[] = []
  for (const rel of files) {
    const abs = join(cwd, rel)
    let bytes: Buffer
    try {
      const s = statSync(abs)
      if (!s.isFile() || s.size > MAX_FILE_BYTES) continue
      bytes = readFileSync(abs)
    } catch {
      continue
    }
    // Fast binary-ish check: bail if the file has a lot of NUL bytes.
    let nuls = 0
    for (let i = 0; i < Math.min(512, bytes.length); i++)
      if (bytes[i] === 0) nuls++
    if (nuls > 16) continue

    const text = bytes.toString('utf-8')
    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(text)) {
        hits.push(`${name} in ${rel}`)
        break
      }
    }
  }
  return hits
}
