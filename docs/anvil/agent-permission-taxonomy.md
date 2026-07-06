# Agent permission taxonomy

`anvil doctor` flags agents whose tool grants drift from the risk class
implied by their slug. This page explains the rule, the classes, and how to
fix a flagged warning.

## The rule

Anvil agents already encode their role in their slug via a doer-noun suffix
(per `CLAUDE.md` Naming section). The suffix names the **permission class**,
and each class has a fixed expected tool scope:

| Class | Scope | Allowed tools | Forbidden tools |
|---|---|---|---|
| `-reviewer`    | read-only      | Read, Glob, Grep         | Edit, Bash |
| `-analyzer`    | read-only      | Read, Glob, Grep         | Edit, Bash |
| `-explorer`    | read-only      | Read, Glob, Grep         | Edit, Bash |
| `-hunter`      | read-only      | Read, Glob, Grep         | Edit, Bash |
| `-surfacer`    | read-only      | Read, Glob, Grep         | Edit, Bash |
| `-validator`   | read-only      | Read, Glob, Grep         | Edit, Bash |
| `-verifier`    | read-only      | Read, Glob, Grep         | Edit, Bash |
| `-selector`    | read-only      | Read, Glob, Grep         | Edit, Bash |
| `-architect`   | write-capable  | Read, Edit, Bash, Glob, Grep | — |
| `-orchestrator`| write-capable  | Read, Edit, Bash, Glob, Grep | — |
| `-builder`     | write-capable  | Read, Edit, Bash, Glob, Grep | — |
| `-resolver`    | write-capable  | Read, Edit, Bash, Glob, Grep | — |
| `-simplifier`  | write-capable  | Read, Edit, Bash, Glob, Grep | — |
| `-worker`      | write-capable  | Read, Edit, Bash, Glob, Grep | — |

The taxonomy lives in `src/core/types.ts` as `AGENT_PERMISSION_TAXONOMY`. It
is Zod-validated at module load; the doctor row reads it directly.

## How the doctor row works

The row `agent-permission/class-scope` (under the `agent-permission`
category) does three things per agent:

1. Classifies the slug via `classifyAgentSuffix(slug)`. Agents whose slug
   does not end in any recognised doer-noun suffix are skipped silently —
   the existing `Slug-namespace integrity` row already catches that.
2. Computes the **effective tool set**: `tools` minus `disallowedTools`. CC
   subtracts the deny list at runtime, so the doctor row mirrors that.
3. Compares the effective tools against the class's `forbiddenTools`. Any
   intersection is a violation.

Status semantics:

- `pass` — every classified agent's tools are within its class scope.
- `warn` — at least one read-only class carries `Edit` or unconstrained
  `Bash`. The detail line names the agents and the unexpected tools.
- `skip` — `agents/` tree is absent, or every agent's slug is unclassified.

The row never **fails**. Drift is a soft signal: it surfaces in `anvil
doctor` so reviewers can audit it during PR review, but a clean local
release does not get blocked.

## Fixing a flagged warning

When the row warns about an agent like `bad-reviewer`, you have three
options. Pick the one that matches the agent's actual job:

### Option 1 — Trim the tools

If the agent really is read-only, remove `Edit` / `Bash` from its
frontmatter `tools:` field. This is the common case.

```yaml
# before
tools: [Read, Edit, Glob, Grep]

# after
tools: [Read, Glob, Grep]
```

### Option 2 — Deny the tool explicitly

If the agent inherits a wider tool set from a base profile but does not need
write permission, list the offending tool under `disallowedTools:`. The
doctor row honours the deny list:

```yaml
tools: [Read, Edit, Glob, Grep]
disallowedTools: [Edit]
```

### Option 3 — Rename the agent

If the agent genuinely needs `Edit` / `Bash` and its role is write-capable
(it builds, refactors, or resolves things rather than reviewing them),
rename the slug to use a write-capable suffix:

```
bad-reviewer.md  →  bad-resolver.md  (or -builder, -worker, etc.)
```

Update every reference (`Agent({subagent_type: "anvil:..."})`, registry
entries, plan citations) at the same time. The slug-namespace doctor row
will refuse a mid-renaming state, so keep the rename to a single commit.

## Override path (escape hatch)

There is currently **no per-agent override field**. The expected behaviour
when an agent legitimately needs to break class scope is to rename it to
the matching class. A future revision (tracked under follow-ups)
may add a `permission_override_reason: <string>` field on the frontmatter;
until that ships, the rename is the canonical path.

## Why naming-derived?

Agents already encode role in their slug, and slug-derived classification is
zero-cost: no new frontmatter field, no migration. The trade-off is that a
class change requires a rename — but a rename is also how reviewers find
the agent, so the slug *should* travel with the role.

## See also

- `CLAUDE.md` — Naming section (slug grammar)
- `src/core/types.ts` — `AGENT_PERMISSION_TAXONOMY`, `AgentPermissionClass`,
  `classifyAgentSuffix`
- `src/commands/cli/doctor-checks/agent-permission.ts` — the doctor row
- `src/commands/cli/common/agent-permission-check.ts` — pure coverage helper
- `.anvil/tickets/-agent-permission-taxonomy.md` — the ticket
