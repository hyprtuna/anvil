# OpenCode Plugin Reference

## What this is

Anvil ships a global OpenCode plugin that registers your skills, dispatches
hooks on tool calls, injects agent personas, and prepends a routing directive
into every session. The plugin is the single integration point between Anvil
and OpenCode — you install it once at a global path and both user and project
OpenCode configs load it via a `file://` URL.

For the full research background that informed this integration (handler
coverage audit, OpenCode lifecycle mapping, rationale for unsupported items),
see
[`.anvil/_archive/docs-anvil/audits/2026-04-29-references-research/05-oh-my-openagent.md`](../.anvil/_archive/docs-anvil/audits/2026-04-29-references-research/05-oh-my-openagent.md).

---

## Install topology

```
~/.anvil/
├── manifest.json                    ← runtime manifest (skills, agents, hooks)
├── plugins/
│   └── opencode/
│       ├── index.js                 ← compiled plugin (built from src/opencode-plugin/)
│       └── package.json             ← plugin package manifest (@anvil/opencode-plugin)
└── skills/
    ├── using-anvil/                 ← bootstrap skill (always registered)
    └── <skill-name>/                ← per-skill directories
```

**User config** — `~/.config/opencode/opencode.json` loads the plugin:

```json
{
  "plugin": ["file:///home/<user>/.anvil/plugins/opencode/index.js"]
}
```

> **Note:** an absolute path is required — tilde (`~`) is not expanded by OpenCode.
> Run `anvil init --target opencode` instead of hand-editing; it writes the
> correct absolute path for your system.

**Project config** — `.opencode/opencode.json` at your project root loads
the same plugin. Requires a prior `--opencode-user` install (or a manual
global plugin build):

```json
{
  "plugin": ["file:///home/<user>/.anvil/plugins/opencode/index.js"]
}
```

> **Note:** an absolute path is required — tilde (`~`) is not expanded by OpenCode.
> Run `anvil init --target opencode` to generate the correct path automatically.

**Manifest** — `~/.anvil/manifest.json` is what the plugin reads at startup
to discover which skills are enabled. It is written by `anvil init` and
updated by `anvil skill enable` / `anvil skill disable`. The plugin reads
it on every `config()` call; no restart is needed after adding a skill.

`OpenCodeConfig` schema fields (validated by Anvil at install time):

| Field | Type | Description |
|---|---|---|
| `plugin` | `string[]` (optional) | Plugin `file://` URLs to load |
| `skills.paths` | `string[]` (optional) | Extra skill directories (Anvil also writes these) |

The outer config object is permissive (`passthrough`) so OpenCode can add
fields Anvil does not know about. The inner `skills` block is strict — unknown
`skills.*` keys surface as a `warn` in `anvil doctor`.

---

## Build and install

Build the plugin and wire OpenCode configs in one step:

```bash
# Global (user) install — writes ~/.anvil/plugins/opencode/index.js
#   and sets ~/.config/opencode/opencode.json
npm run build
./install.sh --opencode-user

# Or once `anvil` is on PATH:
anvil init --target opencode --scope global
```

Project-level wiring (writes `.opencode/opencode.json` in CWD):

```bash
anvil init --target opencode --scope project
# Note: requires --opencode-user first (the plugin must exist globally)
```

Verify the install:

```bash
anvil doctor
# Look for:
#   ✓  OpenCode plugin built and reachable
#   ✓  OC plugin agents loaded
```

---

## Lifecycle handlers — wired

The plugin registers the following handlers. Handlers marked **blocking** can
abort the operation if a hook returns exit code 2.

| Handler | Anvil hook kind(s) | What it does | Blocking? | Source |
|---|---|---|---|---|
| `config` | `session-start` | Reads `~/.anvil/manifest.json`; pushes every enabled skill directory (and the global skills root) into OpenCode's `cfg.skills.paths`. | No | `src/opencode-plugin/index.ts` |
| `tool.execute.before` | `pre-tool-use` | Dispatches registered `pre-tool-use` hooks before each tool call. Throws `OcHookBlockedError` when any hook exits with code 2, causing OpenCode to abort the call. | **Yes** | `src/opencode-plugin/hooks/dispatcher.ts` |
| `tool.execute.after` | `post-tool-use` | Dispatches registered `post-tool-use` hooks after each tool call. Never throws; failures are appended to `oc-hook-failures.jsonl`. | No | `src/opencode-plugin/hooks/dispatcher.ts` |
| `experimental.chat.messages.transform` | `user-prompt-submit` | Three operations in order: (1) prepend routing directive from `.anvil/active-routing.json` (idempotent via `<!-- anvil-routing -->` marker); (2) inject agent persona when the message starts with `@anvil:<slug>`; (3) prepend `using-anvil/SKILL.md` to the first user message (idempotent via `<!-- anvil:bootstrap -->` marker). | No | `src/opencode-plugin/index.ts`, `src/opencode-plugin/agents/dispatch.ts` |

**HookKind → OC event mapping** (from `src/core/manifest-schema/opencode.ts`):

| Anvil `HookKind` | OpenCode event |
|---|---|
| `session-start` | `config` |
| `user-prompt-submit` | `chat.messages.transform` |

The `tool.execute.before` and `tool.execute.after` handlers are wired directly
to OpenCode lifecycle events; they do not go through the HookKind map.

---

## Lifecycle handlers — unwired

These Anvil hook kinds have no OpenCode equivalent today. The OpenCode adapter
generates the artifact file (in case OpenCode adds support later) but does
**not** register the hook with the plugin loader. `anvil doctor` surfaces this
list so users with OpenCode targets are not surprised.

| Anvil `HookKind` | Closest OC handler | Why not wired today |
|---|---|---|
| `session-end` | none | OpenCode has no session-end lifecycle event |
| `pre-tool-use` | `tool.execute.before` | Covered by direct wiring (see §Wired above) |
| `post-tool-use` | `tool.execute.after` | Covered by direct wiring (see §Wired above) |
| `pre-compact` | none | No compaction lifecycle in OpenCode |
| `notification` | none | OpenCode does not expose a notification hook |
| `stop` | none | No stop/abort lifecycle event |
| `subagent-stop` | none | No subagent lifecycle in OpenCode |
| `pre-commit` | none | Git hook — not an AI tool lifecycle event |
| `post-edit` | none | File-edit hook — no equivalent OC event |
| `pre-push` | none | Git hook — not an AI tool lifecycle event |
| `on-error` | none | No error-recovery lifecycle in OpenCode |
| `on-pr-open` | none | CI/GitHub hook — not an OC event |
| `post-test-run` | none | Test-runner hook — not an OC event |
| `context-monitor` | none | No context-window monitoring hook in OpenCode |
| `prompt-guard` | none | No prompt-level guard event |
| `phase-boundary` | none | Workflow orchestration — no OC equivalent |
| `read-guard` | none | File-read guard — no OC equivalent |
| `workflow-guard` | none | Workflow guard — no OC equivalent |
| `on-large-output` | none | Internal Anvil dispatcher hook — no OC equivalent |

Source: `UNMAPPED_OC_HOOKS` in `src/core/manifest-schema/opencode.ts`.

---

## Lifecycle handlers — unsupported (declined)

These OpenCode capabilities were evaluated and explicitly **declined** for
v0.11.2. They will not appear in either the wired or unwired tables.

| Feature | OpenCode surface | Rationale |
|---|---|---|
| MCP server registration | `mcp` config block | R-411: Anvil does not yet have an MCP server; wiring this would require changes outside the plugin scope. Deferred unless Anvil itself gains MCP support. |
| Session compaction hook | `experimental.session.compacting` | R-415: Compaction semantics are experimental and the API may change. Wiring today risks breakage on every OpenCode update. |

See `docs/anvil/releases/v0.11.2.md` §"Out of scope" (lines 68–71) for the
full rationale and deferred-to references.

---

## Skill and agent invocation

### Invoking a skill from OpenCode

Skills are registered as OpenCode tools via the `config()` handler. Once the
plugin loads, every enabled skill in `~/.anvil/skills/` appears as a tool
OpenCode can call. No special syntax is needed — skills are discovered
automatically at session start.

To check which skills are active:

```bash
anvil doctor           # shows skill registration status
```

### Invoking an agent from OpenCode

Address an agent by starting your message with `@anvil:<slug>`. The plugin's
`experimental.chat.messages.transform` handler detects the mention and injects
the agent's persona as a system message before the model sees the prompt.

```
@anvil:code-reviewer Please review the diff in the last commit.
@anvil:plan-verifier Is this plan internally consistent?
```

Agents live at `~/.anvil/agents/*.md`. Each file has a `name:` frontmatter
field matching the slug. The plugin loads all agents once at startup
(`src/opencode-plugin/agents/registry.ts`).

The mention syntax is **case-sensitive** and must be anchored at the start of
the message (leading whitespace is allowed):

```
@anvil:code-reviewer ...   # dispatches
@anvil:CODE-REVIEWER ...   # does NOT dispatch (wrong case)
  @anvil:code-reviewer ... # dispatches (leading space OK)
```

---

## Troubleshooting

### Plugin not built

**Symptom:** `anvil doctor` shows `OpenCode plugin built and reachable` as
`fail`; `~/.anvil/plugins/opencode/index.js` is missing.

**Fix:** The plugin is built by `npm run build` during install. Re-run:

```bash
npm run build
./install.sh --opencode-user
```

Or from the anvil CLI:

```bash
anvil init --target opencode --scope global
```

### Config drift — plugin URL points elsewhere

**Symptom:** `anvil doctor` shows `OpenCode plugin built and reachable` as
`warn`; the plugin file exists but the OpenCode config `plugin` array does not
point to `file://~/.anvil/plugins/opencode`.

**Fix:** Re-wire the OpenCode config:

```bash
anvil init --target opencode --scope global
```

This rewrites `~/.config/opencode/opencode.json` with the correct plugin URL.

### Stale `~/.anvil/plugins/opencode/`

**Symptom:** Skill changes or agent additions are not reflected in OpenCode.

**Fix:** The plugin reads `~/.anvil/manifest.json` fresh on each `config()`
call, so new skills should appear without a restart. If the plugin binary
itself is stale (e.g. after an Anvil upgrade), rebuild:

```bash
npm run build
./install.sh --opencode-user
```

### Manifest missing

**Symptom:** `anvil doctor` shows a manifest-related warning; OpenCode starts
but no skills are loaded.

**Fix:** Run `anvil init` to create `~/.anvil/manifest.json`:

```bash
anvil init --target opencode --scope global
```

### Skill not found in OpenCode

**Symptom:** A skill you installed is not appearing as an OpenCode tool.

**Checklist:**
1. Confirm the skill is enabled: `anvil doctor` → check skill registration rows.
2. Confirm `~/.anvil/manifest.json` lists the skill with `"enabled": true`.
3. Check that `~/.anvil/skills/<skill-name>/` exists and contains a `SKILL.md`.
4. If the skill was just added, restart OpenCode so the plugin re-runs `config()`.

### Hook fired but not visible in OpenCode

**Symptom:** A hook that fires in Claude Code does not appear to run in
OpenCode.

**Check the hook kind.** Only `pre-tool-use` (→ `tool.execute.before`) and
`post-tool-use` (→ `tool.execute.after`) are wired to OpenCode tool lifecycle
events. All other hook kinds are in the `UNMAPPED_OC_HOOKS` set — they have
no OpenCode equivalent today (see §"Unwired" above).

For `pre-tool-use` / `post-tool-use` hooks, check `oc-hook-failures.jsonl`
in the Anvil home directory for dispatch errors.

---

## References

- **Wave-1 audit** — `.anvil/_archive/docs-anvil/audits/2026-04-29-references-research/05-oh-my-openagent.md`:
  deep-dive into OpenCode's 10-handler plugin lifecycle that informed this integration.
- **Release slate** — `docs/anvil/releases/v0.11.2.md`: decisions, out-of-scope items,
  and exit criteria for the OpenCode adapter rewrite.
- **Implementation plan** — `.anvil/_archive/docs-anvil/plans/2026-05-03-v0.11.2-bundle-e-opencode-docs.md`:
  the plan that produced this document.
- **Design doc** — `.anvil/specs/anvil-design.md`: overall system design.
- **Hook authoring** — `docs/hook-authoring.md`: how to write Anvil hooks.
- **Skill authoring** — `docs/skill-authoring.md`: how to write Anvil skills.
