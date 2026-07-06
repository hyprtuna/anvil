# Contributor vs end-user surfaces

Anvil ships two surfaces: a user-facing CLI/plugin (everything end users
see) and a contributor-only dev-script suite (everything contributors
need to develop Anvil itself).

## User surface

- `anvil <cmd>` — the binary; subcommands like `init`, `doctor`, `skill`,
  `plan`, `plan-run`, `plan-status`, `skill-lint`, `agent-lint`, `hook-lint`, etc.
- Slash commands under `~/.anvil/plugins/claude-code/commands/`
- Hooks under `~/.anvil/plugins/<adapter>/hooks/`
- Skills under `~/.anvil/skills/`
- Agents under `~/.anvil/agents/`

## Contributor surface

- `npm run dev:*` scripts (`dev:release`, `dev:worktree`, `dev:pr-branch`,
  `dev:skill-eval`, `dev:test`, `dev:status`, `dev:verify:skills`,
  `dev:verify:agents`, `dev:doctor`)
- Located under `scripts/dev/` in the repo
- Excluded from the npm publish artifact (`package.json#files` whitelist)
- Never installed into `~/.anvil/`
- Architecture test (`no-src-imports-from-scripts-dev`) enforces the
  one-way dependency: `scripts/dev/` may import `src/`; `src/` may NOT
  import `scripts/dev/`

## Common contributor tasks — where to look

| Task | Surface | Command |
|---|---|---|
| Build the project | contributor | `npm run build` |
| Run all tests | contributor | `bun run gate` (or `bun test`) |
| Lint + typecheck | contributor | `bun run gate` |
| Check repo state (agent-friendly JSON) | contributor | `npm run dev:status` |
| Cut a release | contributor | `npm run dev:release -- <version>` |
| Add a new skill | contributor (then user) | `skills/` + `anvil skill lint` |
| Add a new agent | contributor (then user) | `agents/` + `anvil agent lint` |
| Run doctor checks | user + contributor | `anvil doctor` (user); `npm run dev:doctor` (contributor-only rows) |
| Lint skills in source tree | contributor | `npm run dev:verify:skills` |
| Lint agents in source tree | contributor | `npm run dev:verify:agents` |

## What moved in v0.15.3

Several commands that lived in the `anvil` binary were relocated to
`scripts/dev/` because they serve contributors only, not end users:

| Old invocation | New invocation |
|---|---|
| `anvil release <version>` | `npm run dev:release -- <version>` |
| `anvil worktree create\|cleanup` | `npm run dev:worktree -- create\|cleanup` |
| `anvil pr-branch` | `npm run dev:pr-branch -- ...` |
| `anvil skill eval` | `npm run dev:skill-eval` |
| 26 Anvil-only `anvil doctor` checks | `npm run dev:doctor` |

The 21 user-meaningful doctor checks remained in `anvil doctor`. The
remaining checks were promoted to dedicated lint commands: `anvil skill lint`,
`anvil agent lint`, `anvil hook lint`.

## Pointers

- Per-script docs: [scripts/dev/AGENTS.md](../scripts/dev/AGENTS.md)
- Release policy: [release-policy.md](release-policy.md)
- Skill authoring: [skill-authoring.md](skill-authoring.md)
- Hook authoring: [hook-authoring.md](hook-authoring.md)
- CLI exit codes: [docs/anvil/exit-codes.md](anvil/exit-codes.md)
