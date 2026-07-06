# scripts/agent — JSON Status Helpers

ANV-0156: Read-only introspection helpers for autonomous agents. Each script
emits exactly one JSON object to stdout, exits 0 on success or 2 on failure,
and never writes to stderr unless `--debug` is passed.

## Usage

```bash
bunx tsx scripts/agent/branch-state.ts   | jq .
bunx tsx scripts/agent/dirty-files.ts    | jq .
bunx tsx scripts/agent/test-summary.ts   | jq .   # uses cache if < 10 min old
bunx tsx scripts/agent/test-summary.ts --fresh | jq .  # always re-runs vitest
bunx tsx scripts/agent/gate-status.ts    | jq .   # runs bun run gate
```

## JSON Schemas

### branch-state.ts

```ts
{
  ok: true,
  branch: string,           // current branch name
  base: string,             // release branch derived from package.json version
  ahead: number,            // commits ahead of base
  behind: number,           // commits behind base
  dirty: boolean,           // worktree has modified/deleted tracked files
  untracked: boolean,       // worktree has untracked files
  lastCommitSha: string,    // short SHA of HEAD
  lastCommitSubject: string // subject line of HEAD commit
}
```

On failure: `{ ok: false, error: string }`, exit 2.

### dirty-files.ts

```ts
{
  ok: true,
  modified: string[],   // files modified in worktree (unstaged changes)
  staged: string[],     // files staged in index
  untracked: string[]   // untracked files
}
```

On failure: `{ ok: false, error: string }`, exit 2.

### test-summary.ts

```ts
{
  ok: true,
  pass: number,
  fail: number,
  skip: number,
  durationMs: number,
  failures: Array<{
    file: string,    // test file path
    name: string,    // full test name
    message: string  // first failure message
  }>
}
```

Cache: reads `.anvil/vitest-report.json` if mtime < 10 minutes. Pass `--fresh`
to bypass the cache and re-run vitest with `--reporter=json`.

On failure: `{ ok: false, error: string }`, exit 2.

### gate-status.ts

```ts
{
  ok: true,
  lint: 'pass' | 'fail' | 'skip',
  typecheck: 'pass' | 'fail' | 'skip',
  tests: { pass: number, fail: number },
  rebaseBase: 'pass' | 'fail' | 'skip',
  overall: 'pass' | 'fail',
  durationMs: number
}
```

Runs `bun run gate` internally. `overall: 'fail'` + exit 2 when gate fails.

On error (gate could not be spawned): `{ ok: false, error: string }`, exit 2.

## Exit codes

| Code | Meaning |
|------|---------|
| 0    | Success — JSON emitted, `ok: true` |
| 2    | Failure — JSON emitted with `ok: false` (or gate returned non-zero) |

## Preserved file

