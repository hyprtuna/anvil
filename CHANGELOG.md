# Changelog

All notable changes to Anvil are documented here.

## [0.18.0] — 2026-06-22

Doctor & Test Tiers — restore iteration speed. Tier `anvil doctor` and the test
suite, lift the vitest fork cap, cache the build, and prune redundant checks.

### Added
- **Doctor tiers** — `anvil doctor --tier quick|standard|deep|diagnostic-dump` (and `--smoke` = quick) with measured per-tier SLA timing (quick <2s, standard <5s).
- **Test tiers** — `test:smoke` / `test:fast` / `test:adapter` / `test:full` vitest scripts + an env gate so skill-e2e runs only on demand.
- **`prose-ai-tell` doc-lint rule** — warn-only denylist of AI-tell filler words across `skills/`/`agents/`/`docs/`, surfaced in doctor at standard+.

### Improved
- **`gate:fast`** script + a content-hash build cache so unchanged inputs skip the rebuild.
- Count-drift guard extended to **commands** and **AGENTS.md**; count now derives from registered commands, not file-walking (review fix).
- Deleted 2 duplicate-of-test doctor rows (Model-id allowlist) and 3 tautological doctor-row tests, each with coverage-equivalence proof.

### Fixed
- Isolated per-worker tmpdirs (keyed on `VITEST_POOL_ID`) and made the vitest fork cap configurable via `VITEST_MAX_FORKS`; the default stays at 2 (a residual `dist/`-read race makes 3+ flaky — opt into higher parallelism at your own risk; tracked as a follow-up).
- Reconciled the doctor row/module count with the live surface (77 push-fns / 20 modules) + a self-deriving drift guard.

## [0.17.0] — 2026-06-21

Model Registry + Tier Architecture + SDD workflow refactor — the most architecturally consequential release on the v1.0 path.

### Added
- `SKILL_MODEL_REGISTRY` + `AGENT_MODEL_REGISTRY` — runtime-extensible registries that replace frontmatter as the model-assignment source of truth ( schema from the tier-system research).

### Changed
- Migrated all 10 `preferred_model` consumers to read from the registry.
- Resolver-chain documentation reconciled with code (8-layer chain).
- SDD moved from the `anvil spec` CLI command to a composed `/sdd-workflow` skill/agent/command; `anvil spec` deleted.
- `tier` enum now emits a friendly error on invalid values.

### Behavior changes (model assignments)

group-membership reconciliation moved 5 skills to different resolver groups, changing their effective model + effort:

| Skill | v0.16 | v0.17 | Reason |
|---|---|---|---|
| brainstorm-spec | sonnet/medium | opus/high | Frontmatter declared `group: planning`; skill was missing from planning group members |
| code-review | sonnet/medium | opus/high | Frontmatter declared `group: review`; skill was missing from review group members |
| plan-verification | sonnet/medium | opus/high | Same pattern: missing from review members |
| using-anvil | sonnet/low | sonnet/medium | Frontmatter declared low effort; meta group ships medium |
| default-feature | sonnet/medium | sonnet/high | New `workflow` group introduced for this and using-git-worktrees |

These reconciliations align resolver output with what the skill frontmatter originally intended (the skills declared their group but were absent from the corresponding `members[]` array in `defaults.ts`).

### Breaking Changes

- �� `preferred_model`, `preferred_effort`, `max_tokens`, and `fallback_model` are no longer accepted in skill frontmatter. Skills that declare these fields will now cause the `frontmatter-portability` doctor row to **fail** (previously a warning in v0.16). **Migration:** remove these fields from your skill frontmatter. To override model/effort per skill, add the skill name to `[assignments]` in `anvil.toml`, or add it to a model group in `models.json`. For example:
 ```toml
 # anvil.toml
 [assignments.my-skill]
 model = "opus"
 effort = "high"
 ```
 The codemod (`bunx tsx scripts/dev/codemod-frontmatter.ts --strip-preferred --skills-only`) strips these fields from all skill files automatically.

### Fixed
- MCP 4-tuple dropped from agent files (retained on commands).

## [0.16.0] — 2026-06-21

Foundation release — feature-flag system + OpenCode compatibility (frontmatter, mode, slash rename).

### Added
- Feature-flag architecture: `src/experimental/` tree with build exclusion + doctor coverage.
- Frontmatter `x-anvil` namespace + codemod for agents and skills.

### Changed
- Moved catalog, notepads, and extensions under `src/experimental/` (/0248).
- OpenCode adapter now injects per-agent `mode:`.
- Doctor: new permissive `frontmatter-portability` row.
- Removed unused `SkillFrontmatter` fields (`inputs`, `outputs`, `isHidden`, `tooltip`, `workflow`).

### Fixed
- Slash-command colon-name rename across 3 files.

## [0.15.7] — 2026-05-16

**Theme:** Catalog Discovery. Builds on v0.15.6's manifest foundation to ship two user-facing surfaces: `anvil extension install|list|uninstallanvil catalog list-sources|refresh|search|list|show|fetch|status|promote|dropExtensions`, `Catalog quarantine` + `Catalog cache`) report install state and stale caches; `anvil doctor --catalog~/.anvil/extensions/installFromDirectory`, never writing the installed tree directly.

### Added

- [P2] �� Extension install UX. `anvil extension install <archive|dir>` with `--on-collision={skip,abort,fail,replace,rename}`, `--rename <slug>`, `--yes`, `--json`. Atomic install via `_tmp/install-<pid>-<ts>/` stage + rename-into-place; concurrent-safe registry writes via sentinel lock. Interactive collision resolution emits an `ANVIL_DECISION:` JSON line on stdout under `ANVIL_HOST=claude-code` (exit code 10 reserved for host re-invocation); falls back to a stdin TTY reader; non-TTY without `--on-collision` exits 4. `anvil extension list [--verbose|--json]` reads the registry; `anvil extension uninstall <name>` runs a conservative `requires[]` dependency check (URI body starts with `<name>/` or equals `extension:<name>`) and refuses with exit 5 unless `--force`. Doctor row "Extensions" reports installed count, unresolved collisions, schema-invalid manifests, and version-compat mismatches; `expectedAbsence: true` when registry absent. Three slash counterparts (`extension-install`, `extension-list`, `extension-uninstall`) and cli-parity wiring.
- [P2] �� External catalog quarantine + promotion workflow. New `src/core/catalog/` (layer 0) with Zod schemas (`CatalogSource`, `CatalogIndexEntry`, `QuarantineRecord`, `ProvenanceMetadata`, `PromotionResult`), SHA256-content-addressed blob cache with atomic-rename + stale-fallback + TTL, HTTPS-only fetcher honouring `ANVIL_OFFLINE=1`, and a ten-validator pipeline (`schema → slug-shape → byte-md5-dedupe → slug-collision → permission → description-shape → surface-claim → required-env → token-budget → license`). CLI surface `anvil catalog list-sources|refresh|search|list|show|fetch|status|promote|drop` (9 verbs, all with `--json`); `promote` runs the pipeline then calls `installFromDirectorysafeExtract` path-traversal guard. End-to-end round-trip integration test uses an in-process `node:http` fake server (no real network). Bundled-source list is a constant for now; user-configurable sources defer to a follow-up.

### Improved

- [P2] �� Catalog drift CI guard. `anvil doctor --catalog` flag restricts output to catalog rows (`catalog-quarantine-state`, `catalog-cache-health`); exit code reflects only catalog row severities. Quarantine row reports pass/warn/fail by validation decision per entry; cache row reports pass when every source's index TTL is fresh (<24h), warn when ≥1 source is stale-fallback, skip when offline or no sources configured.

### Fixed

- [P2] �� Worktree classifier returned `action: 'skip-primary'` for three distinct cases (protected paths, non-`.worktrees` paths, and the actual primary worktree). Added `'skip-protected'` to `CleanupAction`; runtime behaviour unchanged (orchestrator pre-filters before classify) but unit-level tag is now correct for downstream JSON consumers.
- **release-script** — `flipSlateStatus` regex accepted only `Status: in-progress` (hyphen), but every v0.15.x slate uses `Status: in progress` (space, canonical per AGENTS.md). Release ceremony failed at step 4 on every cut attempt; fix accepts both forms.

### Refactored

- [P2] �� Plugin doctor-check skip rows for null `installed_plugins.json` payload now carry `expectedAbsence: true`, matching the pattern established. Default-quiet doctor output no longer leaks plugin-related skip rows when the payload is absent.

### Composition + carry-out

Composition floors met (≥1 debt / ≥1 improvement / ≥1 fix / ≥1 addition, ≤40% any single item). Slate at draft had 2 tickets and 2 gaps (debt + fix); both closed by promoting backlog items + from the v0.15.6 carry-out. Five follow-up tickets filed back to backlog: `ExtensionManifest` `tools[]` + `required_env` extension (unblocks two partially-hollow validators), strict Zod `parseIndex` / `readIndex` hardening, tree-listing `fetch_kind` real implementation, real `wshobson` `INDEX.json` source, `anvil catalog refresh --purge-blobs` escape hatch.

## [0.15.6] — 2026-05-16

**Theme:** Extensions Foundation. Opens the door to external skill/agent packs by landing the manifest library, the `<pack>:<slug>` namespace syntax, the `anvil:` resource URI scheme, and optional MCP / context-provider metadata on skills. Banks the OpenCode adapter-parity research that will drive v0.16's per-adapter auto-generation. Mid-window split: the original xl extension ticket was halved at Wave 2 — library-only here; install UX (interactive collision resolution, CLI surface, doctor row) carries to v0.15.7 as

### Added

- [P2] *(split — library half)* — Extension manifest schema (Zod, with `schema_version`), path-traversal-safe archive extractor (10k-entry / 256 MiB DoS guards, `fs.realpath` symlink hardening), and three-tier collision *detector* (namespace match → core-shadow → cross-extension). Pure functions under `src/installer/extensions/`; no CLI surface yet. Install UX moves to in v0.15.7.
- [P2] �� `anvil:` resource URI scheme. Grammar `anvil:[<pack>:]<kind>/<slug>[/<version>][#<fragment>]` covers seven kinds (skill, agent, hook, command, slash, plan, ticket). Resolver lives in `src/core/uri/` (layer 0); accepts canonical and legacy shorthand forms; errors returned as `Result.Err`, never thrown. Path-traversal-hardened via slug regex + `path.resolve` start-anchor + symlink realpath. 34 unit tests across grammar / map / resolve / security. RFC at `.anvil/specs/anvil-uri-scheme.md`.

### Improved

- [P2] �� `<pack>:<slug>` namespace syntax for catalog entries. New `src/core/pack/` module (parser + resolver + types) with resolution order project > home > bundled > installed packs. CLI surface: `anvil skill list --pack <name>` filter, `anvil skill run <pack>:<slug>`. Doctor row "Pack collisions" surfaces unscoped slugs resolving to ≥2 sources. 27 new tests. Non-anvil pack resolution intentionally throws an actionable "lands in error until install UX lands.

### Refactored

- [P1] �� Optional skill MCP + context-provider metadata, adapter-validated. `SkillFrontmatter` gains `mcp_servers?: SkillMcpServerRef[]` and `context_providers?: ContextProviderRef[]`; loader merges per-skill `mcp.json` sidecar (GitNexus pattern, sidecar wins on conflict). Doctor row "Skill MCP providers" runs PATH-availability checks. `Elicitation` / `ElicitationResult` event subscription + `mcp_tool` handler type added (per claude-code-docs §9). New `supportsSkillMcp` adapter capability flag (CC + OC both true today). Recommend-don't-build posture preserved: Anvil declares MCP refs, consumers wire actual servers.

### Researched

- �� OpenCode adapter parity + per-adapter auto-generation. Inventories the 63-artifact gap between Claude Code and OpenCode (18 agents and 45 slash commands invisible to OC today). Recommends **build-time projection** via an extended `render-matrix` data-table per adapter with optional `adapters.<kind>` frontmatter overrides — extends prior art rather than re-architecting. Doctor row "Adapter parity" sketched. v0.16 implementation slate (A1–A10) drafted with effort estimates; pairs with (CLI-free install).

### Composition + carry-out

- Composition: 1 refactor, 1 improvement, 2 additions ( split, 0 fixes, 1 docs/research. Fix-floor gap acknowledged at slate-cut and not closed during impl — clean waves surfaced no bugs to promote. Within composition policy.
- **Carry-out to v0.15.7:** (extension install UX — CLI commands, interactive collision resolution, doctor row) filed and slotted.

## [0.15.5] — 2026-05-16

**Theme:** Health & Research. Pays down the workarounds v0.15.3 introduced (recursive vitest subprocess + sentinel env var), formalises the new-adapter acceptance-transcript policy, ships content-overlay composition for skills, and banks three research deliverables that inform v0.16's architecture choices.

### Improved

- [P1] �� Acceptance-transcript policy for new adapters. PRs touching `src/adapters/` or `src/opencode-plugin/` now require a captured `transcripts/<date>-<adapter>.json` artifact; CI lint enforces. Reviewer checklist verifies bootstrap injection + Skill auto-trigger for canonical prompt. Motivating examples cited: W-001 (missing bootstrap), W-002 (hook map drift).

### Added

- [P1] �� `bootstrap/anvil-slug-references` doctor check. Parses bootstrap content for `anvil:<slug>` and `Skill('<slug>')` mentions and verifies each slug resolves in the loaded skill registry; warns on dangling references with remediation hints. Catches the same family of stale-slug bugs as/
- [P2] �� Composition-strategy frontmatter for skills (`replace | prepend | append | wrap` + `{CORE_TEMPLATE}` placeholder). Third-party packs can extend Anvil skills without forking. New `strategy:` + `extends_skill:` fields on `SkillFrontmatter`; loader pass runs after sub-skill resolution and provider dedup; doctor row lists active overlays per skill. 18 unit tests cover all 4 strategies.

### Refactored

- [P1] �� Eliminated the recursive vitest subprocess in `scripts/dev/*` that caused the 2026-05-16 OOM-killer incident (~50 GiB RSS swarm, reaped session services). All 4 agent helpers (`branch-state`, `dirty-files`, `gate-status`, `test-summary`) now expose zero-arg in-process functions; `scripts/dev/check-status.ts` calls them via imports instead of spawning subprocesses; `dev-scripts.test.ts` rewritten in-process (60s → 1.46s). v0.15.3 workarounds removed: `ANVIL_VITEST_NESTED` sentinel deleted (zero refs remain), `--exclude` argument retired, `describe.skip` guard gone.

### Researched

- �� Templates infrastructure for skills/agents. Hybrid storage (centralised `templates/<kind>/` + per-skill `helpers/` carve-out) with typed Zod payloads; promotes `DecisionPrompt` to generic `TemplateKind<P>`; 5 implementation ticket sketches for v0.15.6+.
- �� Tickets→tasks rename + project-derived prefix convention. Exhaustive touch-site inventory (~1,061 hits / 275 files); 9-step gate-green migration sequence; rename-and-warn backwards-compat strategy via new `legacy-tasks-layout` doctor row + `anvil migrate tasks` CLI.
- �� CLI-free plugin install. State inventory across 4 domains; 20-behaviour breakage analysis; Option B (plugin-side hooks as runtime) recommended via weighted scoring (86 vs 75 / 70); multi-slate ticket sketches–0218.

## [0.15.4] — 2026-05-16

**Theme:** User-choice migration + runtime-state hardening. Scales the v0.15.3 user-choice pilot to the remaining 7 "both" skills and 3 "both" agents, and refactors `plan-verifier` for generic plan-vs-goal use — finishing the "clean user product" arc started in v0.15.3. Moves per-project runtime state out of the project tree to `~/.anvil/projects/<auto-name>/` (eliminates worktree clobbering + repo pollution). Patches `/uninstall --scope global` to preserve user data rather than nuke all of `~/.anvil/`.

### Improved

- [P2] �� User-choice prompt pattern applied to 7 "both" skills (`brainstorm-spec`, `plan-verification`, `decision-template-discipline`, `read-background-results`, `two-stage-review`, `autonomous-execution`, plus sibling Task(general-purpose) prompts). Anvil-specific grammar (D-NN decisions, `<decisions>` block, ValidationMap, `${ANVIL_*}` envs, Plan 30 contract, `spec-reviewer` / `code-quality-reviewer` agent refs) moved to sibling `anvil-addendum.md` files loaded only on Anvil-flavor opt-in. +80 e2e tests covering both flavors.
- [P2] �� User-choice prompt pattern applied to 3 "both" agents (`ultra-worker`, `subagent-executor`, `orchestrator`). SDD hard-gate content (`ANVIL_SPECS_DIR`, `brainstorm-spec` gate, `<decisions>` coverage check, `anvil plan-validate-coverage`, `anvil review --strict-review`) moved to `agents/_addenda/<agent>-anvil.md`. Default recommendation derived from `.anvil/` directory presence via `hasAnvilDir`. +57 agent-e2e tests + new `tests/integration/agent-e2e/load-agent.ts_*` exclusion convention to slug-namespace scanners (`walkMd`, `walkSlugFiles`).
- [P2] �� `plan-verifier` refactored to generic plan-vs-goal verification. SDD Gate 1/2 logic (parsing `spec.md` decisions, `covered_decisions:` plan frontmatter) moved to `agents/_addenda/plan-verifier-anvil.md`. Generic fallback runs when no SDD context detected — does the plan plausibly achieve its stated goal, no decision-coverage requirement. +24 e2e tests covering both flavors + edge cases.

### Fixed

- [P0] �� `/uninstall --scope global` no longer nukes `~/.anvil/` wholesale. Now enumerates 12 install-managed subdirs (`agents/`, `bin/`, `cache/`, `.claude-plugin/`, `commands/`, `hooks/`, `plugins/`, `runtime/`, `skills/`, `templates/`, `models.json`, `version`) and preserves user data: `projects/`, `sessions/`, `preferences.json`, `logs/`. `~/.anvil/` itself is `rmdir`-attempted at the end — succeeds only when no user data survives. Project scope unchanged.

### Refactored

- [P1] �� Per-project runtime state (`active-routing.json`, `active-skill.json`, `project.json`, `registry.json`) moved out of `{cwd}/.anvil/` to `~/.anvil/projects/<auto-name>/` via new layer-0 `src/core/io/project-scoped-paths.ts`. Worktree-safe by construction — reuses `deriveProjectNameensureProjectDir` call moves legacy files; `.gitignore` keeps legacy paths as a safety net.

### Notes

- **Re-cut notice** — original 19-ticket v0.15.4 slate landed only the 5 user-choice/runtime tickets. The remaining 14 re-cut to v0.15.5 'Health & Research' (7), v0.15.6 'Extensions Foundation' (5), and v0.15.7 'Catalog Discovery' (2). See `.anvil/plans/v0.15.5.plan.md` / `v0.15.6.plan.md` / `v0.15.7.plan.md`.
- **Composition** — debt 1 + improvement 3 + addition 0 + fix 1 + docs 0 (5 tickets total). Addition floor waived per `docs/release-policy.md` § Override rules: at slate-cut none of the original addition tickets (Extensions/codemap/URI scheme/namespace/policy) were ready for the v0.15.4 window; rather than block on xl-scoped Extensions work, the slate re-cut to ship the user-choice and runtime work in a smaller patch release. Additions resume in v0.15.5 ( codemap) and v0.15.6 .
- **Process** — release-branch workflow established mid-cycle. All v0.15.4 commits landed on `release/v0.15.4`; PR'd to main on release-cut. Future releases follow the same pattern (per `~/.claude/projects/.../feedback_release_branch_workflow.md`).

## [0.15.3] — 2026-05-16

**Theme:** Distribution boundary — dev vs user surface. End-user `anvil doctor` shrinks from ~99 rows to 42 (58% reduction). 4 dev-only CLI commands move to `scripts/dev/*.ts` (excluded from user bundle). 21 user-meaningful doctor checks promoted to new `anvil skill|agent|hook lint` commands. 26 Anvil-only checks moved to `npm run dev:doctor`. 3 pilot skills rewritten to two-question (location + format) user-choice pattern with per-project preferences.

### Added

- [P1] �� New `anvil skill lint`, `anvil agent lint`, `anvil hook lint` commands with multi-root resolver (`<project>/.claude/skills`, `~/.anvil/skills`, `--target <path>`). Slash counterparts wired. Backed by `src/core/lint-roots.ts` (layer-0).
- [P1] �� Location-driven two-question user-choice prompt pattern (`docs/skills/user-choice-pattern.md`). Q1: where to store (`.anvil/<kind>/` Recommended / `docs/<kind>/` / `~/.anvil/projects/<auto-name>/` / custom). Q2: format (JSON / Markdown / Both). Reuses `DecisionPrompt` primitive; example skill + rule (`user-choice-discipline`) + FakeAgent E2E.
- [P1] �� Dev-script test/verification automation suite: `scripts/dev/test-agent.ts` (focused vitest runner), `check-status.ts` (combined repo-state JSON), `verify-skills.ts`, `verify-agents.ts`. npm scripts `dev:test`, `dev:status`, `dev:verify:skills`, `dev:verify:agents`.
- [P1] �� Preferences persistence at `~/.anvil/preferences.json` (Zod-validated, atomic write). Per-project auto-name derived from git remote → cwd basename → 6-char hash. New `anvil projects list` and `anvil projects show` user-facing CLI commands.

### Improved

- [P1] �� 4 dev-only CLI commands relocated to `scripts/dev/*.ts`: `release`, `worktree create|cleanup`, `pr-branch`, `skill eval`. Removed from user `anvil` surface. Invokable via `npm run dev:release`, `npm run dev:worktree`, etc.
- [P1] �� Migrated 21 user-meaningful checks from `anvil doctor` into the new `anvil skill|agent|hook lint` commands. Each check generalized to use the multi-root resolver. Skill checks (14): slug-namespace, name-uniqueness, sub_skills graph, providers, activation, skill-shadow, CSO discipline, description budget, 5×desc-shape, catalog, content-lint, provenance-coverage/object/freshness, CC-native fields, expected_tokens, version-coverage. Agent checks (4): required-reading budget/paths, agent+hook safety annotations, agent-permission-taxonomy. Hook checks (3): exit-code contract, handler size, templates/embedded-prose-lint.
- [P1] �� 26 Anvil-only checks moved out of `anvil doctor` into `scripts/dev/dev-doctor.ts` (npm run dev:doctor). Includes 18 ceremony rows (count-drift, version-sync, doc-drift, surfaces-audit, etc.) and 8 bundle-internal rows (slash-menu cap, OC-hook-registry, tier-integrity, etc.). End-user `anvil doctor` registry trimmed accordingly.
- [P2] �� `code-review` skill rewritten to two-question user-choice pattern. Plan 30 JSON contract extracted to `plan30-addendum.md`, loaded when format is JSON/Both. Sibling prompt files cleaned of internal `ANV-NNNN` and `src/core/types.ts` references.
- [P2] �� `plan-writing` and `default-feature` skills converted to directory-form and rewritten to two-question pattern. Anvil-specific slate format (`<decisions>` D-NN, executable_plan YAML, plan-verifier regex) extracted to `anvil-addendum.md` per skill, loaded when format is Anvil-slate/Both.

### Fixed

- [P1] �� `skill registry health` and `Skill loading mode` doctor rows no longer hardcode `process.cwd/skills`. New `resolveSkillsRoot(cwd, anvilHome)` helper falls back to `~/.anvil/skills/` when source tree absent. User-install doctor rows now report correctly outside the Anvil source tree.

### Refactored

- [P1] �� `scripts/dev/**` is now the contributor-only surface, excluded from the user bundle via `package.json#files` whitelist. New user-facing "Dev-script leakage" doctor row scans `~/.anvil/` for stray `scripts/dev/` paths. Architecture test (`no-src-imports-from-scripts-dev`) enforces that no `src/**` file imports from `scripts/dev/**`.

### Docs

- [P2] �� New `scripts/dev/AGENTS.md` per-script reference table covering all 9 dev scripts (purpose, invocation, output contract). `scripts/dev/CLAUDE.md` stub. New `docs/contributor-vs-user.md` explaining the two surfaces with a v0.15.3 migration table. Root `AGENTS.md` Release Ceremony section updated to use `npm run dev:release`. `docs/AGENTS.md` and `docs/release-policy.md` updated to reference the new dev-script paths.

### Notes

- **Vitest recursion guard** — During development, a subprocess chain (`bun run dev:status` → `check-status.ts` → `gate-status.ts` → `bun run gate` → vitest → `dev-scripts.test.ts` → `bun run dev:status` → ...) caused a ~50 GiB RSS swarm that triggered an OOM event. Fixed inline via `ANVIL_DEV_SCRIPT_TEST=1` sentinel that the test sets and the scripts honor (skipping gate-status / vitest spawn). Gate runtime improved from 195s to 72s. Deeper structural fix (replace subprocess hops with ES-module imports) scheduled as in v0.15.4.
- **Composition** — debt 1 + improvement 5 + addition 4 + fix 1 + docs 1 (12 tickets total; satisfies the ≥1-of-each policy).

## [0.15.2] — 2026-05-15

**Theme:** Skill/Agent Authoring Refinements — second batch of P2 authoring ergonomics building on v0.14.0's anchor work. Focus on per-skill activation/scope semantics, hook archetypes (rule-reinforcement + pre-compact), and the plan-runner's transition from state-tracker to autonomous executor. Renumbered from v0.14.1 mid-cycle (v0.15.1 shipped first and stranded the original number behind a newer tag).

### Added

- [P2] �� `anvil skill pin/unpin <slug>` CLI to promote helper skills without raising the user-invocable cap. Storage at `~/.anvil/pins.json` (Zod-validated `{ pins: string[] }` shape); default cap of 5; `effectiveHome` helper keeps the store test-friendly. Pinned skills surface in the slash menu under a "Pinned" section above "All skills"; JSON mode annotates rows with `pinned: boolean`. `anvil doctor` adds a pin-count row. Slash counterparts (`/anvil:skill-pin`, `/anvil:skill-unpin`) wired through the CLI-parity contract.

- [P2] �� OpenCode plugin cleanup-registry (`src/opencode-plugin/cleanup-registry.ts`). LIFO drain with per-handler 5s timeout (configurable), sync+async error isolation, `Symbol.asyncDispose`/`dispose` alias, idempotent unregister handles, re-entrant-safe drain guard. Three real call sites migrated: hook discovery cache, hook dispatcher manifest-disabled cache, per-plugin-instance `agentMap`. Plugin lifecycle wired through new `shutdownAnvilPlugin` + `installShutdownHandlers` binding to `beforeExit`/`SIGINT`/`SIGTERM`.

- [P2] �� Compactable startup-guidance sections (`src/hooks/handlers/session-start/compaction.ts`). Pure `compactStructuralSections(text, budget, priorities)` strips known structural blocks (`<anvil_skills>`, `<anvil_agents>`, `<routing_rules>`, `<agent_catalog>`, `<team_compositions>`) wholesale when budget is tight, replacing each with `[<section> elided to fit budget]`. Lowest priority elided first; reads `ctx.config.hooks.session_start.budget_charsSESSION_START_BUDGET_CHARS=6000`.

- [P2] �� Optional `activation:` skill-frontmatter block. Skills can now declare `globs[]`, `languages[]`, `events[]` for pre-routing filter without an LLM round-trip. Loader-context-free; activation pre-filter wired into `selectSkills` (which receives `ProjectContext` at routing time). Reduction logged under `ANVIL_VERBOSE`. Doctor adds an activation-count row. Schema-additive — skills without the block continue to work unchanged.

- [P2] �� `SkillScope` tagging (`home` / `project` / `bundled`) with shadow detection. Every loaded skill is stamped with its scope (default `bundled` via Zod default). Collision precedence: Project > Home > Bundled. Doctor adds a "skill-shadow" row warning when Home/Project shadows Bundled (suppress with `--allow-shadow`). Routing trace via `writeActiveSkill` includes scope in `active-skill.jsonSkillFrontmatter` Zod bump.

- [P2] �� Per-turn rule reinforcement hook (`UserPromptSubmit` archetype). Re-injects a compact "rules of the road" reminder every N turns (default 20) or on configured keyword triggers (defaults: `"let's just"`, `"skip the"`, `"for now"`, `"just do it"compactStructuralSections`. Disable via `anvil.config.json` or `ANVIL_DISABLE_REINFORCEMENT=1`.

- [P2] �� Structural validator for memory-file edits (CLAUDE.md / AGENTS.md). New `src/hooks/handlers/memory-validator.ts` (PreToolUse) enforces: required H1 retained, stub-file parity (the canonical `@./AGENTS.md` 2-line form), no table headings dropped. Reuses `STUB_PATTERN` regex from the `tests/unit/architecture/claude-md-is-stub.test.ts` source-of-truth. Bypass via `ANVIL_ALLOW_RESTRUCTURE=1` or hook-input `allow_restructure=true`. Four violation kinds surfaced in `HookResult.context`: `missing-h1`, `h1-changed`, `stub-broken`, `table-heading-dropped`.

- [P2] �� Wire OpenCode `pre-compact` experimental hook to persist `active-routing.json` + `active-skill.json` snapshot to sidecar at `.anvil/runtime/pre-compact-<timestamp>.json` (with `.anvil/runtime/` gitignored). `SessionStart` reads the most recent sidecar (mtime < 1h, 5s clock-skew tolerance) and injects a `<session-restore>` digest. Disable via `ANVIL_DISABLE_PRE_COMPACT=1` or `disabled.hooks` config. Doctor adds a "pre-compact handler-wired" row. Shared SessionStart budget coordination via `src/hooks/handlers/session-start/shared-budget.ts` (declared-reservations table, not a runtime token pool — the two handlers fire on different lifecycle events).

- [P2] �� Hook-handler profile manifest. `HookHandler.profiles?: Record<string, ProfileConfig>` + `defaultProfile?: string` for runtime mode-switching without reinstall. Config: `hooks.<name>.profile = "<minimal|balanced|strict>"`. Precedence: explicit config > `defaultProfile` > undefined (legacy). Two handlers migrated as proof-of-pattern: `memory-validatorprompt-guard` (minimal: scan `.claude-plugin`/`.opencode` only; balanced: 5-path warn; strict: scan all + block). Doctor adds active-profile-per-handler row.

- [P1] �� Plan-runner autonomous execution. Three phases delivered: (A) `cc-task-events` handler now wired into the dispatcher for `TaskCreated`/`TaskCompleted`; (B) real `Task` dispatcher in `StepContext` — `plan-run --auto` flips from no-op to actual dispatch via subprocess (`claude --print` / `opencode run --print`) gated by host-detection env vars, falling back to no-op cleanly when no host detected; (C) true parallel concurrency for `parallelism: 'parallel'` waves via `Promise.all` over batches, capped at `ANVIL_PARALLELISM_CAP` (default 5, mirroring the orchestrator's ≤5 rule). Sibling failure does not abort the wave — failures map to `failed-blocked` outcomes. Request-hash idempotency preserved under concurrent dispatch.

### Improved

- [P2] �� `expected_tokens?: number` field on `SkillFrontmatter` + `AgentFrontmatter` (`z.number.int.nonnegative.optional`); installer aggregates across selection and warns when cumulative exceeds `compression.expected_tokens_warn` (default 50000). `--allow-large-bundle` overrides. Pure aggregator at `src/core/expected-tokens.ts` (layer-0); both CLI and TUI render the budget line consistently. Doctor warns when N skills/agents lack the field (gradual adoption — never fails). Co-exists cleanly with the activation/scope schema additions.

- [P2] �� Decision auto-mode runtime wiring. (v0.14.0) shipped `resolveDecisionAutoMode` + `writeDecisionAuditEntry` but never plumbed the flag source — every callsite defaulted to `{ action: 'wait' }`. This ticket adds `RuntimeContext.autoMode` + `RuntimeContext.acceptDefaults` (Zod), `--auto`/`--accept-defaults` CLI flags + `ANVIL_AUTO=1`/`ANVIL_AUTO_DEFAULTS=1` env vars (precedence: explicit flag > env > default false) on `discuss`/`plan`/`plan-run`, and wires `renderDecisionWithRuntimeContext` into `renderSkillBody` so `${TEMPLATE:decisions}` blocks short-circuit on `auto-select` with audit-trail at `.anvil/decisions/<timestamp>.json`. `confidence: low` always waits regardless of `--auto`; `--accept-defaults` overrides even at low confidence.

### Fixed

- [P2] �� `anvil release <version>` auto-copies `.anvil/plans/v<version>.plan.md` → `docs/anvil/releases/v<version>.md--force-copy` flag overrides for re-copy semantics. Dry-run renders the copy step as step 1 of 5. Missing plan aborts with `anvil release: plan file not found at .anvil/plans/v<version>.plan.md. Draft the plan before releasing.` This v0.15.2 release ceremony itself is the first dogfood of the new behavior.

### Refactored

- [P2] �� Agent render-matrix as data. Procedural switch/case in adapter renderers replaced with a single `AGENT_CONFIGS: Record<AdapterKind, AgentRenderConfig>` map at `src/agents/render-matrix.ts`. Baseline snapshot test (`render-matrix-baseline.test.ts`) captures sha+bytes for all 18 claude-code agent files and asserts opencode emits none — verified byte-for-byte preservation (snapshot_diff_lines: 0). Architecture test asserts agents layer no longer reaches into adapters. Net +147 LOC (structural win: adding a 3rd adapter is now a config-table extension, not new branching code — not a LOC reduction at the current 2-adapter scale).

### Tested

- [P2] �� Pluggable-agent E2E harness at `tests/integration/skill-e2e/`. One-method `Agent` interface (`generateOutput(input, ctx)`); two implementations: `FakeAgent` (canned outputs, CI default, zero-cost) and `LlmAgent` (real Anthropic SDK, opt-in via `ANVIL_E2E_AGENT=llm`, dependency-injected for unit-testability, cost-budgeted per call). Five skill-e2e tests on day one: `tdd-iron-law`, `coding-standards`, `code-review`, `slop-removal`, `verification-before-completion`. `bun run test:e2e:llm` npm script wired for nightly LLM-track CI. Default `bun test` invokes FakeAgent automatically; `@anthropic-ai/sdk` is a dynamic import — not required for the default run.

### Composition

15 tickets shipped (1 fix, 2 improvements, 10 additions, 1 refactor, 1 test). Patch-bump justification: every public-surface addition (new CLI verbs in new optional frontmatter fields in /0123, new hook archetypes in ) is additive-only — no existing surface renamed, removed, or schema-required. Backward compatibility verified end-to-end: skills/agents/handlers without the new fields continue to load and route unchanged.

### Renumber note

This release was originally planned as v0.14.1 (composition locked 2026-05-15). v0.15.1 shipped first (doctor-truthing + worktree polish, also 2026-05-15) and stranded the original number behind a newer tag, so the slate was renumbered v0.14.1 → v0.15.2 in commit `3acb8f7879f006`), and was retroactively marked `released v0.15.1` in . The v0.15.1 release record was left as-published.

## [0.15.1] — 2026-05-15

### Added

- [P2] �� Worktree-aware project root resolution via `git rev-parse --git-common-dir`. Today `resolveProjectRoot` walks upward from `cwd` looking for `.anvil/`; in a linked worktree under `.worktrees/<slug>/`, the upward walk finds only the worktree's `.git` *file* (which points to the common dir, not a `.anvil/`) and either fails or returns the wrong root. Fix: when the upward walk doesn't find `.anvil/` but `git rev-parse --git-common-dir` returns a path with a sibling `.anvil/`, prefer that path. The GetNexus audit and both flagged this gap independently. Scope:
 - Update `src/core/project/detect.ts` (or a new `src/core/project/root.ts`) to add the `git-common-dir` fallback step after the upward walk fails. Pure function; tested via fixture worktree.
 - Update `docs/using-git-worktrees.md` to document `.worktrees/<slug>.claude/worktrees/`).
 - Unit test for the resolver against a fixture linked worktree.
 - **Out of scope (deferred):** `WorktreeCreate` / `WorktreeRemove.anvil/plans/v0.14.0.plan.md`'s hook subsurface — keep parked.
 source: (scoped down to resolver + doc); `docs/anvil/backlog.md` § P2 feature
 est: S
 notes: parallel — `git-common-dir` resolver was an open finding there too.

### Improved

- [P2] �� Self-audit freshness gates on release-tag boundary, not tree mtime. Today `src/commands/cli/doctor-checks/release.ts:330-415` (`checkSelfAuditStalenesssrc/`, `skills/`, `agents/`, takes the max `mtimeMs`, and warns when `_anvil-self-audit.md` is more than 7 days older than that max. The check fires after any normal-velocity week (current state: audit dated 2026-05-07, src edited 2026-05-14 — warn triggers). The threshold was intended to flag *real* drift between the audit and a shipped surface, not commit-by-commit lag. Replace the anchor:
 ```
 audit_mtime vs newest tree mtime → 7d threshold, fires every week
 audit_mtime vs last shipped release tag mtime → fires only after a release ships without an audit refresh
 ```
 Fall back to the current behaviour if no release tag is reachable (clean clone, detached HEAD). Add a 30d ceiling so the row still catches months-of-neglect. `--show-migration` and `--strict` semantics from are unchanged.
 source: `anvil doctor` warn on main 2026-05-15; investigation transcript 2026-05-15
 est: S

- [P3] �� Default-fetch-path test for `anvil worktree creategit fetch origin/<base>` before branching, but no explicit test asserts the default (no-flag) path triggers fetch — coverage is implicit via the no-remote abort test in `tests/integration/cli-worktree.test.ts:197`. Add either: (a) an integration assertion against the bare-remote fixture that omitting `--no-fetch` produces a worktree at the origin SHA, or (b) a unit test on the `index.ts:828` `noFetch` mapping (`fetch === false` → `noFetch: true`; undefined → `noFetch: false`). Prefer (a) — makes the Commander-negation contract self-documenting.
 source: v0.13.5 code review (anvil:code-reviewer, opus, suggestion @ src/index.ts:828)
 est: XS
 bundles: closes review punchlist

### Fixed

- [P1] �� Resolve model aliases before capability snapshot lookup in doctor rows. Two `anvil doctorCapability model provenance` ("3 model ID(s) not in snapshot or heuristics: sonnet, haiku, opus") and `Capability fallback-chain coverage` ("1 fallback chain(s) have 0 snapshot-confirmed entries: defaults"). Root cause is shared: `collectConfiguredModelIds` at `src/commands/cli/doctor-checks/capability.ts:746-760` and `collectFallbackChains` at `:814-835` pull raw alias strings (`sonnet`, `haiku`) from `config.defaults.model` / `fallback_chain` / etc. (defaults defined at `src/core/config/defaults.ts:9-22`) and pass them directly into `lookupCapability`. The snapshot at `data/model-capabilities.json` keys on concrete IDs (`claude-sonnet-4-6`, `claude-haiku-4-5`, `claude-opus-4-7`); the `KNOWN_FAMILY_PREFIXES` heuristic at `src/core/models/capability-snapshot.ts:130-134` is `claude-*-`, so bare-word aliases miss every match and resolve to `'unknown'`. Fix: thread `resolveAlias` (from `src/core/models/aliases.ts:70-99`, already used by `resolve.ts:242`) through both collection functions before the `lookupCapability` call. Rejected alternatives: (i) duplicating aliases into `data/model-capabilities.json` would break the "snapshot keys = concrete provider IDs" invariant called out in `src/core/models/CLAUDE.md`; (ii) loosening the family-prefix heuristic would silence the warn but downgrade `source` from `snapshot` to `heuristic`, leaving the fallback-chain row still warning (it strictly requires `snapshot` per `capability.ts:855`). Only alias resolution fixes both rows. Add a unit test exercising the default config: provenance + fallback-chain rows pass.
 source: `anvil doctor` warn on main 2026-05-15; capability-row root-cause investigation 2026-05-15
 est: XS — ~10 line patch + 1 unit test; both rows close in one commit.

- [P3] �� Regenerate `_anvil-self-audit.md` for v0.15.1 cut. The audit file is dated 2026-05-07 and is naturally stale after v0.13.4 + v0.13.5 (10 net commits to `src/`, `agents/`, `skills/.anvil/prompts/reference-research-audit.md:217-239` as the regeneration entry point. **Pairs with** — both land together so the post-cut doctor output is quiet by default.
 source: `anvil doctor` warn on main 2026-05-15; pairs with
 est: XS — content-only regeneration; no code path touched.

- [P2] �� Rename `research` slash command to resolve slug collision. Post-Wave-1 `anvil doctor` surfaced a fail-class row: `skills/universal/research.md` (skill, activity-noun) collides with `src/commands/slash/research.md` (slash command, should be imperative verb). Rename the slash command to a verb-shaped slug per CLAUDE.md/AGENTS.md naming taxonomy. Update CLI counterpart, registry, tests.
 source: anvil doctor failure 2026-05-15 (`Skill slug duplicates: 1 collision: research`)
 est: XS

- [P2] �� Skill catalog walker should skip `*-prompt.md` files. Post-Wave-1 `anvil doctor` surfaced a fail-class row: `Skill catalog: 4 with invalid frontmatter-prompt\.md$` exclusion). Promotes `BL-audit-skip-prompt-files` from backlog.
 source: anvil doctor failure 2026-05-15 (`Skill catalog: 127 total — 4 invalid`); supersedes `docs/anvil/backlog.md § BL-audit-skip-prompt-files`
 est: XS

- [P3] �� `anvil worktree creategit fetch origin/<base>` before branching with no `spawnSync` timeout. A hung remote (TCP black-hole, slow proxy) blocks the command indefinitely with no signal to the user. Add `timeout: 30_000` (env-configurable via `ANVIL_GIT_FETCH_TIMEOUT_MS`) and surface a distinct error on `SIGTERM`/`ETIMEDOUT`: `"git fetch origin/<base> timed out after N ms — pass --no-fetch or set ANVIL_GIT_FETCH_TIMEOUT_MS=<higher>"`. The `--no-fetch` escape hatch exists, but the hang is exactly the multi-agent footgun was preventing.
 source: v0.13.5 code review (anvil:code-reviewer, opus, suggestion @ src/commands/cli/worktree.ts:93)
 est: XS

## [0.14.0] — 2026-05-15

_TODO: fill in release notes from the slate doc before committing._

## [0.13.5] — 2026-05-14

### Improved

- [P3] �� Stale-base detection in `anvil worktree create`. During v0.13.4, 4 of 5 worktree branches required a rebase before merge because `createmain`, which lagged `origin/main` by N commits in multi-agent sessions where main was updated by a concurrent merge. Fix: immediately before branching, `anvil worktree create` fetches `origin/<base>` for the **resolved base** (whichever branch `resolveBase` in `src/commands/cli/worktree.ts` selects — `opts.base`, `release/v<version>`, or `main`; all three are subject to lag) and branches off the remote SHA rather than the local ref. If the fetch fails (no network, no remote configured), abort with a clear error: `"Cannot create worktree: fetch origin/<base> failed — pass --no-fetch to use the local ref"`. `--no-fetch` flag restores the old behaviour for offline use. Coverage: unit-mocked fetch-failure assertion + two integration tests (3-commits-behind for both `main` and `release/v0.13.6`).
 source: v0.13.4 release-ceremony post-mortem (4/5 worktree branches needed rebase before merge)
 est: S
 bundles: extends (anvil worktree create)

### Fixed

- [P3] �� Gate needs build-before-test. `bun run gate` runs lint → typecheck → tests without ensuring `dist/` reflects current source. During the v0.13.4 ceremony, stale `dist/index.jsbun run build`. Fix: a pre-test step in `scripts/ci/gate.tsbun run build` when `dist/index.js` is **missing** OR when any `src/**/*.ts` is newer than `dist/index.js`. Honours `ANVIL_GATE_NO_REBUILD=1` as an opt-out for CI pipelines that build `dist/` in a prior step. The opt-out short-circuits before any filesystem stat. Pure `needsRebuild` helper exported for unit testing (9 cases).
 source: v0.13.4 release-ceremony post-mortem (stale dist/index.js caused 8 test failures in worktree)
 est: S

- [P3] �� `/tmp/.git` leak investigation and cleanup. An empty `/tmp/.git` directory left by a test fixture broke the `isInsideGitRepo` walker in `src/commands/cli/doctor-checks/skill-checks.ts:88` (re-exported via `src/commands/cli/doctor.ts:175`) — the walker ascends from `tmpdir` and found the stray `.git`, reporting a false git context for unrelated tests. Fix: `tests/unit/commands/cli/doctor-agent-runtime.test.ts` (the walker-fixture host) gains an `afterAll` cleanup of `join(tmpdir, '.git')` and a canary assertion at the top of the suite: `expect(existsSync(join(tmpdir, '.git'))).toBe(false)` — fails fast if the leak recurs before detection tests run.
 source: v0.13.4 release-ceremony post-mortem (false git-context from stray /tmp/.git broke isInsideGitRepo walker)
 est: XS

## [0.13.4] — 2026-05-14

### Added

- [P1] �� `anvil release <version>` command — single idempotent release ceremony. Replaces the ~5 manual steps that gave us PR #69 (the `git mv` rename that left content un-edited):
 1. Bump `version` in `package.json` + `marketplace.json` (Zod-validated semver).
 2. `git mv tests/unit/release/version-bump-v<old>.test.ts tests/unit/release/version-bump-v<new>.test.ts` **and** rewrite the assertions (single atomic action — the v0.13.2 footgun was these being two steps).
 3. Mark `docs/anvil/releases/v<version>.md` as `Status: shipped <ISO-date>` (template-aware edit).
 4. Pre-fill the CHANGELOG entry from the slate doc's `### Added/Improved/Changed/Fixed` sections (best-effort; operator polishes before commit).
 5. Print a one-line summary + the suggested PR title/body to stdout.
 Flags: `--dry-run` (print plan, write nothing), `--json` (structured plan), `--from <version>` (override `package.json`-derived previous version).
 Lives at `src/commands/cli/release.ts`. Tests: unit on each step + an integration test that runs `--dry-run` on a fixture repo and asserts the plan.
 source: v0.13.3 agent-ergonomics backlog § "anvil release"
 est: M

- [P1] �� `anvil worktree create <ticket-id>` / `anvil worktree cleanup` commands. Wraps the orchestrator's worktree dance:
 - **`create`** reads `docs/anvil/releases/v<current>.md` (or `--ticket-file <path>`), derives a slug from the ticket header (e.g. → `anv-0157-install-scope-detection`), branches `feat/<slug>` off the current release branch, creates `.worktrees/<slug>`, registers it, and prints the worktree path + the subagent-ready prompt fragment (a YAML block with branch / worktree / ticket spec excerpt — feeds straight into the agent prompt).
 - **`cleanup`** unlocks + force-removes every `.worktrees/<*>` whose branch has been merged into the current release branch (or `--all` to nuke regardless of merge status), then `git worktree prune` and `git branch -d` for the merged feature branches.
 Hard rules: never touch `.claude/worktrees/agent-*` (those are session-managed by Claude Code); never delete a branch with unpushed commits unless `--force`.
 Tests: unit on slug derivation + a fixture-repo integration test for the create/cleanup happy path.
 source: v0.13.3 agent-ergonomics backlog § "anvil worktree"
 est: M

- [P1] �� `scripts/agent/*` directory of one-line-JSON status helpers. Each script does one thing and prints a single JSON object to stdout (no prose, no colours, no spinners). Initial set:
 - `branch-state.ts` → `{branch, base, ahead, behind, dirty, untracked, lastCommitSha, lastCommitSubject}`
 - `dirty-files.ts` → `{modified: [...], untracked: [...], staged: [...]}`
 - `test-summary.ts` (reads the most recent `bun test --reporter=json` artefact or runs it on demand) → `{pass, fail, skip, durationMs, failures: [{file, name, message}]}`
 - `gate-status.tsbun run gate` — emits the same one-line summary as JSON) → `{lint, typecheck, tests: {pass, fail}, rebaseBase, overall: 'pass'|'fail'}`
 All scripts: exit 0 on success, exit 2 on failure, never write to stderr unless a `--debug` flag is passed. Documented in `scripts/agent/README.md` with one-line usage per helper. CLAUDE.md + AGENTS.md updated to point subagents at these helpers as the canonical "what's the state of this branch / worktree" surface.
 source: v0.13.3 agent-ergonomics backlog § "scripts/agent/*"
 est: M

### Improved

- [P1] �� Promote two informational `skip` rows out of quiet-mode output via `expectedWhen` predicates (same pattern used for wiring rows):
 - `SessionStart context budget` — `expectedWhen: => !existsSync('~/.anvil/logs/session-start-overruns.jsonl')` — hide when the log doesn't exist yet (the "no truncations recorded yet" case).
 - `AGENTS.md routing block` — `expectedWhen: ({ adapters }) => adapters.openCode === false` — hide when OpenCode isn't part of the install topology (the "AGENTS.md is project-owned, run `anvil init --target opencode`" case is a recommendation, not a diagnostic).
 Both rows stay visible with `-v` / `--verbose`. Sweep the rest of the registry for similar offenders (target: net `skip` count in quiet mode ≤ 2 on a fresh global install).
 source: this conversation — user feedback on skip-row noise
 est: S

- [P1] �� Rephrase migration-window suppression detail strings. Today's text:
 ```
 migration window — 120/122 still missing (98%), suppression threshold 80%
 ```
 is jargon — it reads as a config dump, not a diagnosis. Replace with operator-friendly phrasing keyed on the actual ratio:
 ```
 ~99% of skills haven't adopted `version:` yet — suppressed during migration window
 (pass --show-migration to see the warn during back-fill)
 ```
 Same pattern for `Skill provenance freshness`. The detail string is the only change — the suppression logic, threshold, env override, and `--show-migration` flag from are all unchanged. Update the two tests that assert the exact detail-string format.
 source: this conversation — user reported the row was confusing
 est: XS

## [0.13.3] — 2026-05-14

Agent Ergonomics + Carry-Over — closes the v0.13.1 and v0.13.2 deferreds while introducing the single piece of infrastructure that prevents future post-merge hotfixes of the kind that drove this release. (model capability snapshots) re-attempted under strict MustHaves guardrails after the destructive v0.13.1 first attempt. (test-environment divergence) investigation findings shipped as a research artifact; implementation deferred to v0.13.4 as (test-environment determinism). ships the unified `bun run gate` runner that bundles lint + check-rebase-base + typecheck + tests behind a single command — bundles narrower tactical fix.

Plan: `docs/anvil/releases/v0.13.3.md`. Composition: 1 debt + 1 investigation deliverable + 1 addition. Debt-leaning by design; the theme is closing carry-over.

### Added — 1

- **Unified `bun run gate` pre-push runner + doctor `Pre-push parity` row** — new `scripts/ci/gate.ts` chains lint → check-rebase-base → typecheck → tests in fail-fast order, streams each tool's original stdio in real time (async `spawn` + tee, not buffered `spawnSync`), and prints a one-line summary on success: `gate: lint ✓ base ✓ typecheck ✓ tests N/M ✓`. Pure helper `parseVitestCounts` exported for unit testing; tolerates vitest's `Tests N passed | M skipped (T)` format. `package.json` `simple-git-hooks.pre-push` switched from the three-command chain to `bun run gate`; new `gate` npm script added. New `Pre-push parity` doctor row (warn-class) in `release.ts` compares the hook string to the canonical `bun run gate` and warns when out of sync. CLAUDE.md + AGENTS.md "Build and Test" sections collapsed: agents and humans run `bun run gateargv[1]?.includes('gate')`) that caused recursive vitest forks when the test file imported the module (fork bomb), and a synchronous `spawnSync` that buffered ~30 s of vitest output instead of streaming. Final shape: 6 commits, 4789/4799 tests pass end-to-end.

### Changed — 1 (debt/refactor)

- **Model capability snapshots + provenance-aware diagnostics** — re-attempt of the v0.13.1 deferred ticket under strict MustHaves guardrails after a destructive first attempt (the prior agent deleted + files and force-pushed with `--no-verify`). Ten commits across five phases; every commit independently revertable; allowlist enforced by a per-branch pre-flight script (`scripts/agent/anv-0033-allowlist-check.sh`) that fails if any out-of-scope file is touched. New `ModelCapability` + `ModelCapabilitySnapshot` + `CapabilitySource` Zod schemas in `src/core/types.ts`. Bundled snapshot at `data/model-capabilities.json` (committed; `"data/"` appended to `package.json` `files` so it ships in published tarballs); `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-7` curated with public-doc-derived context/output limits and effort support. Loader at `src/core/models/capability-snapshot.ts` uses the dev/dist dual-candidate path probe pattern from `src/core/package-meta.ts` (resolves under both `src/core/models/` and `dist/core/models/`). `ModelResolution` gains an optional `capability_source` field; resolver and trace get a `capabilityRegistry?: ModelCapabilitySnapshot` option (D-06 backwards-compat: omitted when not threaded). Four new doctor rows under the existing `capability` category, one per commit: `capability/snapshot-integrity` (fail), `capability/snapshot-freshness` (90-day threshold, warn), `capability/model-provenance` (warn, silent-on-pass), `capability/fallback-chain-coverage` (warn). +55 new tests, 0 regressions on the existing model resolution suite. New `src/core/models/CLAUDE.md` documents the capability surface. Note: one MustHaves deviation accepted — `doctor.ts` wiring is 26 lines vs the plan's ≤5-line budget; the implementation mirrors the established `pushModelsChecks`/`pushDescriptionShapeChecks` dispatcher idiom so the spirit of the guardrail (no scope creep) is preserved.

### Investigation deliverable

- **Test-environment divergence between pre-push hook and agent worktrees** — shipped as `.anvil/research/anv-0142-test-env-divergence.research.md`. Three confirmed root causes with file:line evidence: (RC-1) tests dispatch real hooks into `~/.anvil/logs/hook-timings.jsonl` without HOME isolation, compounded by vitest's `pool: 'forks'`; (RC-2) `src/commands/cli/doctor-checks/skill-checks.ts:1370-1408` uses `git show HEAD~1:<relpath>`, which is path/branch-sensitive across worktrees; (RC-3) `tests/unit/hooks/handlers/session-start.test.ts:32,50` mutates `tests/fixtures/detect-ts-project/.anvil/git merge-base` skill check + session-start fixture redirect) so the three fixes can soak together in a release themed around test/doctor work.

### Tooling note

- The pre-existing main-guard antipattern in `scripts/ci/check-rebase-base.ts:97-99` (`process.argv[1]?.includes('check-rebase-base')`) shares the same substring-match shape that caused the gate.ts fork bomb. Pre-existing, not regressed by this release — promoted to backlog as (P2). Future agents should run `bun run gate` (or `bun run test`) for the CI gate, NOT raw `bun test` — the native bun runner has known incompatibilities with the suite, and the misclassification of "295 pre-existing failures" by the implementer echoed v0.13.1's F-03 false-baseline failure mode.

## [0.13.2] — 2026-05-11

Doctor Accuracy on Fresh Installs + Workflow Guardrails — v0.13.1 left `anvil doctor` quiet-by-default but still flagged warnings that were either expected absences (project-wiring rows on global-only installs), bulk migration noise (skill version/provenance coverage), genuine content leakage (asset path, third-person voice, README count drift), or stale classifications (claude-mem listed as a "conflict" despite being the recommended memory plugin). v0.13.2 makes doctor's warnings actually mean something on a fresh `anvil init`, codifies orchestration learnings from v0.13.1 into pre-rebase + fixture-stability guardrails, and finishes the doctor.ts extraction started in v0.13.1: the 6,624-line monolith is now a 1,228-line dispatcher over 12 per-category modules.

Plan: `docs/anvil/releases/v0.13.2.md`. (test-environment divergence between pre-push hook and agent worktrees) deferred to v0.13.3 — needs investigation, not a one-shot fix.

### Improved — 2

- **Scope-aware doctor `expectedAbsence`** — `DoctorCheckContext` gains `installScope: 'global' | 'project' | 'both' | 'unknown'`, derived once per run from the presence of `.claude/settings.json` / `.opencode/opencode.json` (project evidence) and `~/.anvil/installed_plugins.json` (global evidence). Four project-wiring rows declare `expectedAbsence` predicates that fire when `installScope === 'global'`: `CC project wiring`, `CC statusline wiring`, `CC settings template`, `OC project wiring`. In quiet mode these are suppressed (still visible with `-v`). New `Install scope` summary row at the top of doctor output (always visible) reports the detected scope. New `--scope <auto|global|project|both|unknown>` CLI flag overrides auto-detection. 14 new unit tests.
- **Migration-window suppression for bulk skill-metadata warnings** — `Skill version coverage` and `Skill provenance freshness` rows now demote from `warn` to `skip` when the missing-ratio exceeds a threshold (default 0.80), so a freshly-introduced field with 120/122 skills missing doesn't pollute every doctor run. Detail reads `migration window — N/M still missing (X%), suppression threshold Y%`. `ANV_MIGRATION_WINDOW_THRESHOLD` env override (clamped 0..1, safe-fallback on NaN/empty). New `--show-migration` CLI flag re-promotes both rows to `warn` for authors tracking back-fill progress. 35 unit tests.

### Added — 1

- **Integration-hint registry; claude-mem reclassified out of `KNOWN_CONFLICTS`** — new `src/core/integrations/known.ts` parallel to `src/core/conflicts/known.ts`, describing third-party plugins that *complement* Anvil rather than conflict with it. Seeded with `claude-mem` in the `memory` category (per backlog R-117/118/119, which already designated claude-mem the recommended memory plugin). `findIntegrationGaps` pure function in `src/core/integrations/scan.ts` mirrors `scanForConflicts` shape. New doctor row `Recommended integrations` emits `pass` when all integrations are present, `skip` (informational, never `warn`) with `recommend: <slug> (<category>) — <reason>; see <url>` when a gap exists, or `skip` with the standard absent-manifest reason when the payload is null. `claude-mem` is removed from `KNOWN_CONFLICTS['claude-code']`; conflict-test fixtures updated to use `superpowers` / `block-no-verify` so the conflict path retains coverage, plus a negative assertion ensures claude-mem never emits a conflict row. 18 new unit tests.

### Fixed — 2

- **Fixture timestamp drift** — `tests/fixtures/detect-ts-project/.anvil/project.json` and `registry.json` mutated on every `bun test` run, polluting `git status`. Added `.anvil/.gitignore` inside the fixture directory ignoring both files and untracked them via `git rm --cached`. No test code changed; tests that read the fixture rely on `tsconfig.json` / `package.json`, not the mutable JSON, and session-start tests write to a temp dir. Two consecutive `bun test` runs now leave `git diff --stat tests/fixtures/detect-ts-project` empty.
- **Three doctor-flagged content fixes** —
 - `autonomous-execution` skill's `references:` frontmatter pointed at a path that didn't exist relative to the skill file. Path corrected to `../../.anvil/specs/output-conventions.md` (the asset resolver uses `dirname(skillFile)` as the base; verified the target file exists at repo root).
 - `rationalization-prevention` skill description started with `"Use when you feel the urge..."desc: third-person voice` lint. Rewritten to `"Use when the urge arises..."`.
 - `README count drift` doctor row reported `universal skills: README says 67, found 52; language skills: README says 54, found 26`. Root cause was the wrong scan depth — `checkReadmeCountDrift` used a shallow `readdirSync` and counted only top-level `.md<slug>/SKILL.md`) and any tier subdirectories. Switched to recursive walking via a new `countMdFilesRecursive` helper that respects `META_FILES` filtering. README counts (67/54) were already accurate; the doctor scan was wrong.

### Changed — 2 (debt/refactor)

- **Strip `src/commands/cli/doctor.tssrc/commands/cli/doctor-checks/`: `architecture`, `capability`, `commands`, `content`, `description-shape` (pre-existing), `docs`, `envelope`, `hooks`, `installer` (pre-existing), `live-eval`, `models` (pre-existing), `plugin`, `release`, `skill-checks`, `statusline`. All ~50 `push*Check` helpers were moved verbatim — zero behaviour change, zero row-output differences. The dispatcher uses an `import as _foo + named re-export` pattern so existing test imports from `'../../../src/commands/cli/doctor.js'` resolve unchanged. Architecture allowlist updated to move two `doctor.ts → installer` allowances onto the new `doctor-checks/plugin.ts → installer` line (no new cross-layer edges).
- **Pre-rebase stale-base guard** — codifies v0.13.1's workflow lesson where sub-agents based feature branches on commits that pre-dated earlier release-branch merges and silently reverted merged tickets. New `scripts/ci/check-rebase-base.ts` CLI computes the fork point between `HEAD` and the inferred release branch (`release/v<package.json.version with patch+1>`, overridable via `ANVIL_RELEASE_BRANCH` env or `--release-branch <name>` arg) and reports how many commits the release branch is ahead of that fork point. Plain-text default output; `--json` mode for programmatic consumers. Pure logic lives in `src/core/rebase-guard/index.ts` (zero imports, layer-0 clean) so it can be imported by doctor without violating the layered architecture. New doctor row `Worktree base freshness` (skip on the release branch itself or on git failure, pass when up-to-date, warn by default / fail under `--strict` when behind). Pre-push hook (via `simple-git-hooks`) now runs the rebase-base check **first** — fast — before the test suite and typecheck. 27 new tests (21 script-level, 6 doctor row).

### Deferred

- (test-environment divergence between pre-push hook and agent worktrees) — moved to v0.13.3. The same `bun test` invocation produces 0 failures from the pre-push hook on `main` and 270+ failures from agent worktrees, and the v0.13.2 work surfaced no obvious root cause. Needs targeted investigation rather than a one-shot fix; pulling it into v0.13.2 risked busting the `z`-release size cap.

## [0.13.1] — 2026-05-11

Contracts & Validation (Wave 2) — finishes the typed-schema and behavioural-check work v0.13.0 started. 12 tickets shipped: doctor row registry + 5 new lint families, skill frontmatter gains `version`/`provenance`/`scripts`/`references`/`assets`, intent layer formally classified, SessionStart context budget, cross-adapter contamination guard, skill subdirectory form, typed system-directive vocabulary, phase-aware artifact loader, count-drift CI gate, and quiet-by-default doctor output with `--verbose`.

Plan: `docs/anvil/releases/v0.13.1.md`. deferred to v0.13.3 (rework needed after destructive first attempt).

### Added — 8

- **Phase-aware artifact context loader** — `src/core/context/artifact-loader.ts` + `src/core/context/markdown-truncate.ts`: pure markdown-aware truncation primitives preserve YAML frontmatter, ATX headings, and checklist items on budget overflow. `loadArtifacts` resolves a priority-ordered manifest per workflow phase (spec/plan/tasks/implement/verify/review/finish), enforces per-artifact char budgets, and caps total SessionStart injection at 6 KB (`SESSION_ARTIFACT_BUDGET_CHARS`). Missing required artifacts emit non-blocking stderr warnings; missing optional artifacts are silently skipped. `renderArtifactBlock` formats loaded artifacts into a `systemInsert`-ready markdown block with phase/budget header and truncation notice. 27 new unit tests covering frontmatter preservation, checklist survival, aggregate cap, and missing-artifact warnings.
- **SessionStart aggregate context budget** — `aggregateSessionStartContext` in `src/hooks/handlers/session-start/budget.ts` collects all `session-start` handler `systemInsert` fragments in priority order and concatenates them up to a configurable `budget_chars` limit (default 6000 chars). Lower-priority fragments that exceed the budget are dropped; when any truncation occurs, `[truncated to fit N char budget]` is appended so the model knows context was elided. `budget_chars: 0` suppresses all context. Overruns logged to `~/.anvil/logs/session-start-overruns.jsonl`; new doctor row `SessionStart context budget` reports recent truncation%. `DispatchResult.sessionStartContext` carries the aggregated output. `hooks.session_start.budget_chars` added to `ModelsConfig`. Trade-offs documented in `docs/anvil/hooks-budgets.md`.
- **Skill `version` + `provenance` frontmatter** — adds structured `provenance` object to `SkillFrontmatter` (`author?`, `amendedFrom?`, `generatedBy?`, `lastUpdated`). Three new `anvil doctor` rows: `Skill provenance object` (warn on `generatedBy` without `lastUpdated`), `Skill version coverage` (warn on missing `version`; `.optional` retained for back-compat — 121 of 122 existing skills lack it), `Skill version regression` (fail when current `version` < `git show HEAD~1:<path>` value), `Skill provenance freshness` (warn when a skill modified in last 30 days lacks provenance). `provenance.lastUpdated` accepts ISO-8601 date or datetime; sub-fields optional for incremental adoption. 35 unit tests across the new doctor rows + schema.
- **Cross-contamination guard (`Adapter.ownedPathPrefixes`)** — `PlatformAdapter` interface gains `ownedPathPrefixes: string[]`. `src/adapters/cross-contamination.ts` exports `checkCrossContamination(writingAdapter, candidatePaths, allAdapters, opts)` which refuses operations when a writing adapter targets a prefix owned by a different adapter. `--allow-cross-target` CLI flag bypasses the guard for explicit overrides. Wired into `src/installer/wire.ts` so installer refuses cross-target writes by default; doctor row surfaces violations. Claude Code adapter owns `.claude-plugin/` and `.claude/`; OpenCode owns `.opencode/` and `plugins/opencode/`. 20 unit tests (14 library + 6 installer/doctor integration).
- **Skill subdirectory form** — `loadSkillsFromDir` now accepts `skills/<tier>/<slug>/SKILL.md` alongside the flat `skills/<tier>/<slug>.md`. When a directory entry contains `SKILL.md`, only that file is loaded; sibling `references/` and `scripts/` dirs are intentionally skipped by the loader (progressive-disclosure pattern). New doctor lint `Skill subdir line-count` warns when a subdir SKILL.md exceeds 200 lines without a sibling `references/`. `skills/CLAUDE.md` documents the convention with layout table and when-to-use guidance.
- **5 description-shape lints** — `doctor-checks/description-shape.ts` exports five non-blocking skill-description hygiene checks (all `warn` in v0.13.x; promotion to `fail` deferred to v0.14 after migration window): (1) `desc: CSO prefix` — must start with a CSO triggering-condition phrase ("Use when…", etc.); (2) `desc: no step list` — no numbered enumeration; (3) `desc: third-person voice` — no first/second person; (4) `desc: length sweet spotdesc: no body dupe` — Jaccard word overlap with body's first paragraph < 0.85. Registered in `DOCTOR_REGISTRY` (category `content`); pure functions exported for unit-test injection. 42 unit tests. `docs/skill-authoring.md` gains a "Description hygiene" section.
- **Skill asset declarations (`scripts:`, `references:`, `assets:`)** — `SkillFrontmatter` Zod schema gains three optional `string[]` fields. Doctor emits `Skill asset files` (warn) when any declared path does not exist on disk; covers all three arrays in one check; only emitted when at least one skill declares an asset. Relative paths resolve against the skill file's directory. `checkSkillReferenceFiles` deprecated and removed. `docs/skill-authoring.md` field table and `scripts/generate-authoring-md.ts` updated. 9 new unit tests.
- **`anvil doctor --strict` count-drift gate** — Three new `pushCountDriftChecks` rows: `checkReadmeCountDrift` parses README.md for skill/agent/hook counts and compares against live filesystem; `checkClaudeMdUserInvocableCap` fails when user-invocable skill count exceeds 15; `checkSelfAuditStaleness` warns when `.anvil/audits/_anvil-self-audit.md` is more than 7 days behind the newest file in `src/`/`skills/`/`agents/`. Default mode emits `warn`; `--strict` promotes any `warn` to `fail` so CI can break on drift. Standalone `bun run doctor:strict` script provided for CI invocation. 21 unit tests.

### Improved — 1

- **Doctor quiet-by-default output + `--verbose` flag** — `anvil doctor` now prints only actionable rows (fails + unexpected warns) in the default quiet mode, with a footer summary (`N ok · M warns · K fail`). Pass rows and expected-absence skips (when CWD is not a project root) are suppressed via structured `expectedWhen` / `expectedAbsence` predicates on `DoctorCheck` entries. `anvil doctor -v` / `--verbose` reproduces the full row list. Ticket-ID parentheticals stripped from row labels (, , , , , ) — IDs preserved in code comments only. Exit-code semantics unchanged. Quiet output drops from ~65 rows to ~5-10 on a clean global install.

### Changed — 3 (debt/refactor)

- **Doctor row registry — typed `DoctorCheck` interface** — `src/commands/cli/doctor-registry.ts` defines `DoctorCheck`, `DoctorCheckContext`, `DoctorCheckRow`, `DoctorCheckCategory`, `DOCTOR_REGISTRY`, and helpers `getChecksByCategory`, `sortChecksByCategory`, `runChecks`. Optional `expectedWhen` / `silentOnPassdoctor-checks/installer.ts` and `doctor-checks/models.ts`. Dispatcher in `doctor.ts` remains thin orchestrator; CLI output preserved. Full extraction of remaining 8 categories scheduled for v0.13.2. 15 unit tests for registry shape, ordering, category filtering.
- **Classify `src/intent/` in the layer model** — `src/intent/` formally documented as layer 1, a peer of `src/skills/`. Updated `src/CLAUDE.md` layer table, `AGENTS.md` and `CLAUDE.md` layer diagrams, and removed the stale `src/intent/` comment from the architecture test. `LAYER_MAP` in `tests/unit/architecture/layer-imports.test.ts` already carried `intent: 1`; this change makes that classification the documented, tested contract.
- **Typed `SystemDirective` vocabulary** — `src/hooks/system-directive.ts` introduces `SystemDirectiveType` (6 variants: `BOOTSTRAP`, `ROUTING_HINT`, `CONTEXT_WINDOW_MONITOR`, `SKILL_REINFORCEMENT`, `ADVISORY`, `DOCTOR_FINDING`) with `createSystemDirective`, `parseSystemDirective`, `dedupeDirectives` helpers (last-wins per type, first-seen-type ordering). `SystemDirectiveType.options` used as single source of truth. Six handler call sites migrated. Dispatcher collects all `systemInsert` values per turn, dedupes, and exposes the merged result as `DispatchResult.systemInsertsessionStartContext`. All existing timing instrumentation, validation telemetry, and hook-output envelope wiring preserved. 19 unit tests.

### Deferred

- ** (model capability snapshots)** moved to v0.13.3 after a destructive first attempt deleted previously-merged files and bypassed the pre-push hook with a false baseline claim. Clean re-implementation scheduled for v0.13.3.

## [0.13.0] — 2026-05-08

Doctor + Runtime Safety — surface coverage, correctness, and conflict hygiene. Every layer gets a watchdog: CC hook events are now catalogued (30/30), routing-rules have a single source of truth, installed plugins are checked for known conflicts, generated files are guarded before any disk mutation, and skills ship with CC-native context/agent frontmatter. Live eval (`anvil doctor --live`) detects premature-tool-use regressions.
Plan: `docs/anvil/releases/v0.13.0.md`. 4447 tests (4429 passing, 10 skipped).

### Added — 3

- **External plugin conflict detector** — `src/core/conflicts/known.ts` + `scan.ts`: known-conflict registry mapping adapter → `ConflictEntry[]`. `pushExternalPluginConflictCheck` runs on `anvil doctor`; emits one warn row per detected conflict. 5 seeded entries: `block-no-verify` (PreToolUse double-fire), `superpowers` (SessionStart race), `claude-mem` (competing skill provider), `claude-hud` (statusline overwrite), `autocomplete-pro` (Stop hook conflict). Severity escalates to `fail` via `ANVIL_CONFLICT_SEVERITY=fail` env var (CI mode). Case-insensitive slug matching; v2 schema enforced with graceful skip on absent/malformed manifest.
- **Skill provider precedence + SHA-256 dedupe** — ordered `SkillProvider` enum + `PROVIDER_DEFINITIONS` table; `(directory, content)`-hash dedupe step in the skill loader. Lower-rank provider wins on duplicate slug. Foundation for safely accepting community skill packs without shadowing Anvil's core registry.
- **Generated-file predicate** — `src/core/project/is-generated.ts`: `isGenerated(filePath, projectRoot)` checks gitignore membership and first 300 bytes for `@generated`/`AUTO-GENERATED`/`DO NOT EDIT` markers. All disk-mutating hook handlers consult this predicate before writing; silently skip generated targets. Cache keyed by `(projectRoot, filePath)` for call-site efficiency.

### Improved — 5

- **Skill behaviour validation rows** — four new `anvil doctor` rows: frontmatter validity, naming convention (skill MUST NOT use agent doer-suffixes), duplicate slug detection across surfaces, required `description` field budget check. Rows backed by exported pure functions (`pushSkillCatalogChecks`, `pushSkillNamingChecks`) for unit-testable isolation.
- **`anvil doctor --live` + premature-tool-use detection** — `pushSkillRegistryChecks` now returns `{ userInvocableNames }` for downstream reuse; `pushSkillFixtureCoverageRow` checks `tests/skill-triggering/fixtures/<slug>.txt` presence; `runLiveSkillEval` runs each fixture through the CC transcript validator and reports premature-tool-use regressions. Transcript validator (`tests/skill-triggering/transcript-validator.ts`) classifies tool-call order: read-only-only → skip; no Skill found → fail; action before Skill → warn; Skill first → pass.
- **CC hook event coverage matrix** — `src/core/manifest-schema/cc-hook-events.ts`: registry of all 30 documented CC hook events with per-event `status` (`mapped`/`future`/`out-of-scope`) and `handler` pointer. Runtime guard asserts exactly 30 entries (`throw` on mismatch, not silent `as 30`). New `anvil doctor` row reports `N/30 mapped, M future, K out-of-scope`. Every mapped entry cross-checked against `HOOK_KIND_TO_EVENT`.
- **CC-native skill frontmatter fields** — `SkillFrontmatter` Zod schema gains `context: z.enum(['inherit', 'fork']).optional` and `agent: z.string.min(1).optional`. New `anvil doctor` row (`computeSkillCcFieldsAdoption`) counts fork/inherit/agent adoption and warns when zero skills declare either field. Doctor catch block changed from `skip` to `fail` so registry load errors are surfaced rather than silenced.
- **Command safety metadata** — MCP-SDK canonical 4-tuple (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) added to `CommandMetadata`; all 24 CLI commands annotated. Replaces the ad-hoc `dryRun?: boolean` flags. New `anvil doctor` row verifies annotation coverage; `computeCommandSafetyScore` exported for unit tests.

### Fixed — 1

- **Typed workflow arguments — no shell interpolation** — workflow input schemas defined; execution via spawn-style argv arrays; shell interpolation of user input prohibited. `WorkflowArg` schema in `src/core/types.ts` (`name`, `description`, `type`, `required`, `default`); `WorkflowDefinition.inputs` replaces the prior untyped `args`. Doctor row warns on any workflow step that contains `${{` or `{{` in a shell-string context.

### Changed — 2 (debt/refactor)

- **MCP 4-tuple safety annotations backfill** — `AgentFrontmatter` and `RegisteredHook` gain `safety: AgentSafetyAnnotationsanvil doctor` row reports X/N agents + Y/M hooks annotated; exported `checkAgentSafetyAnnotations` / `checkHookSafetyAnnotations` pure functions for unit-testable isolation.
- **Routing-rules single source of truth** — `src/intent/intents.ts` (`INTENT_DEFINITIONS`, `IntentDefinition`) becomes the canonical source; `scripts/generate-routing-rules.ts` regenerates `src/core/routing-rules-content.ts` from it. All string literals in the generator use `JSON.stringify` (no raw interpolation). New `anvil doctor` row (`pushRoutingRulesSyncCheck`) performs strict positional equality between `ROUTING_INTENT_TABLE` and `INTENT_DEFINITIONS` — ordering, agent, phrase, and skills array all checked. Eliminates the W-110 static-prose / intent-index triple-disagreement class.

### Composition note

2 debt/refactor ( safety annotation backfill, routing-rules SoT), 5 improvements ( command safety, doctor skill rows, live eval, CC hook matrix, CC frontmatter), 3 additions ( conflict detector, provider precedence, generated-file predicate), 1 fix ( typed workflow args / no shell interpolation). 0 docs items — coverage is through doctor rows and tests, not prose. Improvement count at 5 exceeds the 1–3 cap: all 5 are doctor-row expansions that share the same `Check`-accumulator pattern and were batched for coherence; splitting into two releases would leave half the doctor surface unaudited.

## [0.12.2] — 2026-05-08

Installer & Adapter Integrity — tightening the seams between core, adapters, and runtime hooks. Renderer becomes pure (no shell-out per tick), every hook output channel is capped + secret-redacted, terminal escape sequences are sanitised at the source, and the docs/anvil ↔ .anvil split-brain that confused fresh agents is consolidated into a single canonical tree.
Plan: `.anvil/plans/v0.12.2.plan.md`. 4211 tests passing.

### Added

- **Token redaction primitive** — `src/core/security/redact.ts` masks 8 secret families before any user-visible channel: Slack (`xox[abprs]-`/`xapp-`), Telegram (URL + standalone, uppercase-anchored to avoid epoch:hash false-positives), Bearer/Bot (lookbehind-anchored + ≥16-char value to avoid prose collisions like "forbearer of"), Anthropic `sk-ant-api`, GitHub PAT (`ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_`), AWS access keys, generic JWT. Per-pattern `replace` callbacks preserve scheme keywords (`Bearer <<REDACTED:bearer>>`) instead of swallowing context. Default ON; opt-out via `ANVIL_REDACT=off`; family-allowlist via `ANVIL_REDACT_FAMILIES`. Hook dispatcher now redacts every `process.stderr.write` and validation-log entry (`hook-validation-failures.json`) before persisting.

### Improved

- **Per-tool truncation budgets** — `compression.tool_budgets: Record<string, number>` in `~/.anvil/models.json` lets operators cap large tools individually. Defaults: `webfetch=10000`, `bash=50000`, `read=50000`, fallback=50000. Env override `ANVIL_TOOL_BUDGET_<TOOL>=N`. New doctor row reports active budgets per known tool with source (env/config/default).
- **OpenCode disable-flag doctor warnings** — `anvil doctor` now warns when any `OPENCODE_DISABLE_*` env var (including `OPENCODE_DISABLE_EXTERNAL_SKILLS`, `OPENCODE_DISABLE_CLAUDE_CODE`, and wildcards) is set to a truthy value. Truthy-only semantics match OC's own (`0`/`false`/`no`/`off` are not "set"); aggregated row lists every detected flag with a remediation hint.

### Fixed

- **OSC 8 hyperlink sanitisation** — `sanitiseOsc8(label, url)` strips ESC, BEL, and all C0/C1 control characters from both label and url; URL-encodes via `encodeURI`; returns `null` when the result is empty. All OSC 8 emission now flows through it. Non-OSC paths (`renderDefault`/`renderMaximal` agent.name) also strip controls. Architecture test confines OSC 8 emission to `shared.ts`. Closes the agent-name-injection class first reported as `claude-hud` NEW-OPP-12.
- **doc-test value-pinning regression** — `tests/unit/docs/hook-authoring-schema.test.ts` and `skill-authoring-schema.test.ts` rewritten to assert structurally (`arrayContaining`, schema-walk health) instead of pinning literal counts (`toHaveLength(21)`, "20+ fields") or release versions. Same tests still verify documented coverage; they no longer rot every release.
- **doc-drift regression** — 42 violations across 13 files (1 broken-link, 29 unknown-command, 7 missing-skill-file, 5 missing-template-file) → 0. Source-of-truth fixes preferred over skip markers; 16 markers retained on intentional `references/...` paths and `roadmap.md` planned-command narrative.

### Changed

- **Statusline renderer purity** — `src/core/statusline/render-rich.ts` no longer imports `node:child_process`. Five `execSync` calls (git stat, rev-parse, branch, dirty) moved to a feeder phase in `src/commands/cli/statusline.ts` with 500ms per-tick memoization keyed by cwd. New architecture test `tests/unit/architecture/statusline-renderer-purity.test.ts` enforces the boundary permanently — closes self-audit W-101.
- **Repo consolidation `docs/anvil/` → `.anvil/`** — fresh agents investigating Anvil now read the active corpus, not the historical snapshot. Historical artifacts (`audits/`, `plans/`, `research/`, `references/`, deprecated specs) moved to `.anvil/_archive/docs-anvil/` via `git mv` (history preserved). Active specs (`output-conventions.md`, `tiers.md`, `features/`) and the canonical design (`anvil-design.md`) moved to `.anvil/specs/`. `docs/anvil/{releases/,backlog.md,README.md}` retained for stable external URLs (CHANGELOG, GitHub release notes, PRs); README rewritten to redirect. `FEATURE_BASE`, `phase-boundary` matchers, `pr-branch.ts` `ARTIFACT_PREFIXES`, doctor `findBrokenPlanRefs` (transitional fallback), CLAUDE.md/AGENTS.md "Where to Find Things" all updated. New doctor row warns operators with stale `docs/anvil/features/` directories until v0.13.x.

### Composition note

3 debt/refactor ( layer-0 purity, escape sanitisation, repo consolidation), 2 improvements ( per-tool budgets, doctor row), 1 addition ( redaction primitive), 2 fixes (doc-test value-pin scanner regression + doc-drift 42→0). 0 docs items — every change is code per the plan. 40% diff cap respected (largest item ≈ 30%, mostly renames).

## [0.12.1] — 2026-05-08

Docs Trust + Surface Catalog — restoring trust in what Anvil claims about itself. Every documented surface, install preview, and authoring guide now matches the live runtime; doctor catches drift before users do. No new feature surface, no behaviour changes; this is a hardening release for the surfaces v0.12.0 introduced.
Plan: `.anvil/plans/v0.12.1.plan.md`. 4107 tests passing.

### Added

- **Doc-drift lint engine** — `src/core/docs/lint/` validates internal markdown links, `anvil` command refs, skill/agent/hook slugs, template file refs, and stale schema field names; exposed via `npm run docs:check` and a new `anvil doctor` row. Honours `<!-- doc-drift: skip -->` markers (file + line scope). Includes a parity guard so `KNOWN_ANVIL_COMMANDS` cannot silently drift out of sync with `src/index.ts`.
- **Bootstrap content version-skew check** — `src/core/bootstrap-skew/` parses `anvil:<slug>`, `Skill({…})`, `Agent({…})` references in the OC bootstrap body; new `anvil doctor` row warns on dangling slugs with an actionable remediation hint. Registry root binds to wherever the bootstrap actually resolved (project source, project plugin, or global) so downstream consumers don't false-positive.

### Improved

- **Slash-command semantic parity** — `src/commands/slash/parity-lint.ts` extracts code-span invocation phrases from slash `.md` files and validates each referenced slug against the loaded skill, agent, and CLI command registries. Fixes W-004 (`review.md` referenced a non-existent `code-reviewer` skill — actual surface is `code-review` skill via `code-reviewer` agent). Opt-out via `parity_lint: skip` frontmatter; optional `invoked_surface` field declares intent.
- **Deletion-aware install diff** — `src/installer/diff.ts:67-69` no longer skips deletion detection. `anvil init --dry-run --diff` now enumerates the existing managed tree (staging-root prefix only, with a path-escape guard), set-difference against staged paths, and reports stale files as `status: 'deleted'`. Sync and diff now agree; large directories remain linear via `readdir({recursive:true})`.

### Fixed

- **Install source flag honesty** — `--from-git` and `--from-archive` were advertised in `install.sh`, `src/installer/cli.ts`, and `docs/installation.md` while `src/installer/context-from-repo.ts` threw "not implemented". Flags removed from every advertised surface; implementation file kept scaffolded for the future remote-fetch primitive. `tests/safe-pack-extraction/README.md` placeholder cites the path-traversal safety pattern (12 payloads × 3 surfaces) that must ship before any archive extraction code.
- **Required-reading budget constant** — superseded by (shipped v0.12.0). `REQUIRED_READING_BYTE_CAP = 8 * 1024` is the sole source in `src/agents/required-reading.ts:21`; all consumers import from there. Ticket annotated and closed without code change.

### Docs

- **Hook authoring docs refresh** — `docs/hook-authoring.md` rewritten from `src/core/types.ts` Zod schemas. Documents all 21 `HookKind` values, the real `HookContext` (5 fields) and `HookResult` (4 fields, `.strict`) shapes, profiles + priorities + per-hook budgets, the `if:` permission rule (CC adapter wiring via `h.ifRules`), and a cross-walk to CC's 30 events / 5 handler types. Generator-managed body via `<!-- gen:start -->` / `<!-- gen:end -->` markers preserves hand-edited prose.
- **Skill authoring docs refresh** — `docs/skill-authoring.md` rewritten from `SkillFrontmatter` Zod schema. Replaces the missing `skills/universal/planner.md` reference with `code-review.md` as the canonical example. New sections: description budget (1 536-char per entry / 8 K total), `${CLAUDE_SKILL_DIR}` substitution, description-as-trigger doctrine, voice-profile guidance (opt-in), `chains` vs `sub_skills`, path scoping + language overlays, model alias usage, explicit `user-invocable` checklist for new skills.
- **Authoring generator** — `scripts/generate-authoring-md.ts` (`bun run scripts/generate-authoring-md.ts`) is the single source for both authoring docs. Anti-drift assertions fail loud if Zod internals change (`HookKind=21`, `HookContext≥5`, `HookResult≥4`, `SkillFrontmatter≥20`). Regen-noop test (`--check`) enforces docs-stay-in-sync at unit-test time.
- **Adapter acceptance-transcript policy** — `docs/adapter-transcript-policy.md` + `.github/PULL_REQUEST_TEMPLATE.md` codify that any PR touching `src/adapters/` or `src/opencode-plugin/` MUST include a captured `transcripts/<date>-<adapter>.json` showing bootstrap injection + Skill auto-trigger. CI lint enforces. Motivated by W-001 (missing OC bootstrap) and W-002 (hook-map drift), two P0 adapter bugs that shipped without behavioural gates.

### Composition note

3 debt/fix items ( honesty, constant SoT, version-skew), 3 improvements ( doc-drift lint, slash parity, deletion-aware diff), 0 additions (deferred per release plan: live surface catalog → v0.13.0; generated catalog docs → backlog; audit-capability scoring → v0.14.0), **3 docs items** — slight overage of the 0–2 cap. Justification per release plan §Composition exception: + share a generator (`scripts/generate-authoring-md.ts`); splitting them would publish a half-refreshed manual. is a one-page PR-template addition unrelated to the generator. 40% diff cap respected (largest item ≤ 30%).

## [0.12.0] — 2026-05-08

Hardening pass — 13 P0 items from the self-audit: symlink-safe IO, OC manifest contract, session isolation, bootstrap reliability, headless safety, and contract-drift fixes. No new feature surface.

### Added

- **Symlink-safe IO module** — `src/core/io/safe-write.ts` with `O_NOFOLLOW`, ownership check, and atomic rename; all predictable-path writes routed through it (closes notepad CVE class).
- **`using-anvil` bootstrap skill** — `skills/using-anvil/SKILL.md` created; silent OC bootstrap no-op eliminated; every OC session now receives Anvil bootstrap context.
- **sha256-keyed session sidecar paths** — `.anvil/active-skill.json` and siblings now keyed by sha256 of the transcript path; concurrent-session state corruption eliminated.

### Improved

- **Adapter bootstrap eval contract** — per-adapter acceptance tests assert bootstrap content present; `anvil doctor adapters` row added. (Subsumes
- **Headless-mode tool denylist** — `HEADLESS_MODE_BANNER` in `src/agents/runner.ts` now explicitly denies `AskUserQuestion`, `Skill`, and `SlashCommand` in CI/headless contexts.
- **Bun-runtime dispatcher tests** — new test track spawns hook dispatcher under `bun` (`process.execPath` under OpenCode) and asserts parity with the `node` path.

### Fixed

- ** / Manifest skills contract** — installer now writes `manifest.skills[]` with `schemaVersion: anvil.opencode.v1`; OC plugin previously returned empty list for every real install; Zod-validated at read time.
- ** / Recommender invalid flags** — recommender no longer emits `--skill`/`--hook`/`--agent`/`--mcp`; output validated against declared flags in `init-command.ts`; existing test that asserted the broken string corrected.
- **`SkillFrontmatter.description` cap** — `.max(512)` added to `src/core/types.ts`; doctor warning at 280+ chars; CC selector no longer silently drops skills with overlong descriptions.

### Changed

- **OC hook map single SoT** — `OC_HOOK_MAP` (11 kinds) and `HOOK_KIND_TO_OC_EVENT` (2 kinds) consolidated to one registry; doctor and generated docs no longer contradict the runtime.
- **Routing rules generated from intent metadata** — routing-rule prose now generated from `src/intent/intents.ts`; every referenced slug validated at build time; fixes `code-reviewer` hallucination in every CC session. (Subsumes
- **Required-reading budget constant** — 4 KB / 8 KB duplication resolved; single exported constant referenced by runner, doctor, docs, and tests.

### Docs

- **README skill counts drift guard** — numeric skill counts corrected against live `skills/` tree; CI guard added to fail on future count drift; `anvil doctor --catalog` documented as canonical source.

### Composition note

4 technical debt items ( SoT facets), 6 bug fixes ( , , 3 improvements ( doctor row, 0 features (out of scope), 1 docs item. Debt and bug caps exceeded under the "Hardening releases" override clause in `docs/release-policy.md`; every line item traces to a P0 finding in `docs/anvil/audits/_anvil-self-audit.md`. 3971 tests passing.

## [0.11.2] — 2026-05-04

OpenCode plugin parity — `anvil init --target opencode` now produces a working plugin that loads Anvil skills, hooks, and agents inside OpenCode.
Plans: five per-bundle plan files dated 2026-04-30 under `docs/anvil/plans/` (bundles A–E for v0.11.2 feature work).

### Added

- **OpenCode plugin skill registration** — `config` hook now registers all enabled skills for invocation within OpenCode.
- **OpenCode hook dispatcher** — 5-phase implementation wires 11 `HookKind` values to `tool.execute.before` (blocking) and `tool.execute.after` (advisory) lifecycle handlers. `pre-compact` and `experimental.session.compacting` are out of scope and deferred; see `src/opencode-plugin/hooks/map.ts`.
- **OpenCode agent dispatch** — plugin `experimental.chat.messages.transform` handler parses `@anvil:<slug>` mentions and resolves them to the agent registry (`src/opencode-plugin/agents/dispatch.ts`).

### Improved

- **OpenCode plugin build** — `dist/opencode-plugin/index.js` now built as esbuild target in `npm run build` (was TypeScript fallback).
- **OpenCode config schema tightening** — `OpenCodeConfig` inner `skills` block narrowed with strict key validation; added doctor row "OpenCode config has known keys only."
- **OpenCode adapter detection** — replaced `existsSync(~/.opencode)` heuristic with `isBinaryOnPath('opencode')` check.
- **Hook execution parallelism** — hooks within a kind now run in parallel via `Promise.all` for faster execution.

### Fixed

- **U-001: `anvil init --target opencode` full pipeline** — produces `.opencode/opencode.json` wired to `~/.anvil/plugins/opencode`, surfaces Anvil skills/hooks/agents in OpenCode; acceptance: clean machine smoke test passes.
- **OpenCode plugin URL drift** — fixed incorrect plugin path references across docs and generated config.
- **Test cleanup** — ANVIL_ROOT_OVERRIDE environment variable now deleted (not left in process state).

### Changed

- **Dead artifact removal** — removed dead artifact write paths from `adapters/opencode/generate.ts` (`agents/*.md`, `hooks/*.cjs`, `models.json` to project root); all routing through plugin loader.
- **OcMessage/OcMessages exports removed** — unused Zod exports deleted from `src/opencode-plugin/agents/dispatch.ts`.

### Docs

- **OpenCode plugin reference** — new `docs/opencode-plugin.md` documents plugin lifecycle, handler registration, and integration patterns.
- **Doctor rows** — "OpenCode plugin built and reachable" + "OpenCode agents loaded (N)" now verify plugin health.

### Composition note

1 technical debt item (U-001-cleanup artifact removal), 2 improvements (esbuild build + schema tightening), 3 features (skill config + hook dispatcher + agent dispatch), 1 bug (U-001 full pipeline), 1 docs item (opencode-plugin.md). Single dominant theme: OpenCode plugin parity.

## [0.11.1] — 2026-04-30 — "Orphan Sweep"

Cleanup, layer hygiene, and TUI/CLI parity. Deletes ~580 dead LOC, plugs two silent-failure gaps, and aligns the TUI installer with current CLI flags.
Plans: `docs/anvil/plans/2026-04-30-v0.11.1-orphan-deletes.md`, `docs/anvil/plans/2026-04-30-v0.11.1-tui-installer-sync.md`, `docs/anvil/plans/2026-04-30-v0.11.1-small-items.md`.

> **Composition note:** 3 debt items, 2 bug fixes, 2 improvements, 1 feature, 1 docs item. Bundles A (doctor split) and D (layer-hygiene trampolines) were scoped to this release but deferred to v0.12+; only bundles B, C, and E shipped.

### Removed

- **`src/agents/orchestrator.ts` deleted** (F-001) — orphan module (~80 LOC) with no callers; its runtime tier-table JSDoc relocated to `src/agents/runner.ts`.
- **`src/agents/team.ts` deleted** (F-002) — transitively dead 199-LOC module; all tests removed.
- **`onLargeOutputHandler` alias removed** (F-004) — renamed to `largeOutputHandler`; consumers retargeted.

### Fixed

- **E-004: Dispatcher logs malformed regex to stderr** — when a skill matcher contains an invalid regex, logs the offending pattern to stderr once per process instead of silently no-matching.
- **E-005: Required-reading paths surfaced at runtime and in doctor** — `required_reading` entries referencing missing/unreadable files now emit a stderr warning and a new doctor row "Required reading paths resolve".

### Improved

- **TUI installer drift remediated** (U-002/U-003) — `src/tui/screens/` audited against `src/installer/cli.ts` and `src/commands/cli/init.ts`; missing screens for new flags added, stale option lists removed. Doctor row "TUI screens cover all installer flags" added as regression guard.
- **`.claude/commands` uninstall scoped to sentinel files** (S-006) — uninstall now removes only `anvil-*.md` files, avoiding over-removal when the user has non-Anvil commands in the same directory.

### Added

- **`claude --bare` doctor row** (ROADMAP-doctor-bare) — "Diagnostic: claude --bare available" surfaces Claude Code's `--bare` flag in doctor output for high diagnostic value.

### Tests

- **Version-sync guard** (S-015) — `tests/unit/version-sync.test.ts` asserts `marketplace.json` and `package.json` versions stay in sync.
- **3723 passing tests** (from v0.11.0 baseline). 0 skipped.

### Docs

- **Orphan v0.2.0/v0.3.0 design briefs bannered as historical** (D-021) — `docs/anvil/refs/` design briefs from early versions now carry explicit historical banners to prevent confusion.

## [0.11.0] — 2026-04-30 — "Half-Baked Sweep"

Trimming half-shipped extension surfaces, purging stale v0.3.0-era promises in code/docs, and hardening installer error paths.
See `docs/anvil/features/v0110-half-baked-sweep/spec.md`.
Plan: `docs/anvil/plans/2026-04-30-45-v0.11.0-half-baked-sweep.md`.

> **BREAKING**
>
> - `disabled.hooks` schema narrowed from `z.array(z.string)` to `z.array(HookKind)`. User configs referencing trimmed hook kinds now fail Zod validation at parse time. Trimmed kinds: `comment-checker`, `rules-injector`, plus 14 Plan-28-D1 stubs (`user-prompt-expansion`, `permission-denied`, `file-changed`, `instructions-loaded`, `config-change`, `cwd-changed`, `worktree-create`, `worktree-remove`, `post-compact`, `task-created`, `task-completed`, `elicitation`, `elicitation-result`, `stop-failure`).
> - `preCompactHandler` symbol removed; only `preCompactSnapshotHandler` remains, registered as `pre-compact`.
> - `task-banner` reorganized: still fires async via `setImmediate` from the `pre-tool-use` multiplexer; its inline call moved to a multiplexer entry. `ANVIL_TASK_BANNER=off` kill-switch unchanged.

> **Composition note:** v0.11.0 carries 4 debt items vs the policy cap of 2; this is intentional per slate D-22 ("half-baked sweep" is the release theme).

### Added

- **`agent-redirect` PreToolUse hook** (`src/hooks/handlers/agent-redirect.ts`) — when `subagent_type` starts with `anvil:` but the slug is not in the agent registry, denies with a hint to use `Skill` instead. Opt-in via `workflow.agent_redirect = true`.
- **Statusline expansions** — 9 new sub-fields bundled: `vim.mode`, `worktree.*`, `agent.name` (rich mode), `cache_read`, `cost.total_duration_ms`, `session_name`, `output_style`, `exceeds_200k_tokens` alarm, and OSC 8 hyperlinks.

### Improved

- **`task-banner` multiplexer entry** (S-013) — registered as a proper sub-handler with `priority: -10` in `pre-tool-use.ts`, replacing the prior inline call. Fires last within the pre-tool-use stage; `ANVIL_TASK_BANNER=off` unchanged.
- **Pre-compact snapshot error detail** (E-006) — handler now captures `err.message` and appends it to the JSONL log instead of a single generic message.
- **Runtime-fallback log-write failure** (E-007) — emits a dedup'd stderr line when the telemetry pipe fails; the pipe is no longer silently broken.

### Fixed

- **`preCompactHandler` removal** (F-003) — deprecated registration removed; `preCompactSnapshotHandler` is the sole `pre-compact` handler.
- **Config validation warning** (E-002) — hook handlers now emit a one-time stderr warning naming the path and Zod field when `~/.anvil/anvil.config.json` fails validation.

### Removed

- **HookKind enum trimmed 25 → 21** (S-003–S-005, S-016) — dropped `comment-checker`, `rules-injector`, and 14 Plan-28-D1 stub values that had no registered handlers. `disabled.hooks` Zod schema narrowed to the wired set. Doctor row added: "Every HookKind has a registered handler."
- **Stale v0.3.0 comment/stub sweep** (C-001–C-007) — five sites rewritten to current behavior; version-roadmap framing removed.

### Tests

- **`writeManyAtomic` rollback coverage** (T-003, T-004) — mid-batch failure test + multi-adapter installer mid-fail integration test.
- **Layer-imports architecture test** (T-005) — `tests/unit/architecture/layer-imports.test.ts` enforces the 8-layer import rule with a snapshot allowlist of 17 approved cross-layer edges.
- **3595 → 3723 passing tests** (+128). 0 skipped.

### Chores

- **`warn-once` helper** (`src/core/config/warn-once.ts`) — one-time config-validation stderr emitter used by E-002.
- **Doctor row: "Every HookKind has a registered handler"** — enforces the trimmed enum at runtime.
- **Slate and spec resynced** — `docs/anvil/releases/v0.11.0.md` ordering note, spec D-21 17-edges, `src/hooks/CLAUDE.md` counts updated.

## [0.10.8] - 2026-04-28

Skill provenance schema + comment-analyzer agent + reactive runtime-fallback.
Plan: `docs/anvil/plans/2026-04-28-44-v0.10.8-provenance-comment-analyzer-runtime-fallback.md`.
Spec: `docs/anvil/features/v0108-provenance-comment-analyzer-runtime-fallback/spec.md`.

Three v0.10.7+ deferred items promoted on matured gates:
- **Item 21** (skill-count gate triggered: 121 ≥ 120 at v0.10.5)
- **Item 19** (LLM-backed companion to v0.10.5's regex-grade `Skill content lint`)
- **Item 14** (low-cost reactive safety net; complements the proactive consumer)

### Track 1 — Skill provenance schema (Item 21)

`SkillFrontmatter` extended with three optional fields:

```yaml
source: authored | distilled | imported | unknown
confidence: 0..1
created_at: YYYY-MM-DD
```

- New `SkillProvenanceSource` Zod enum exported from `src/core/types.ts`.
- Loader (`src/skills/loader.ts`) synthesizes defaults at parse time:
 - Universal/language tier → `source: 'authored'`, `confidence: 1.0`
 - User tier → `source: 'unknown'` (confidence stays undefined)
 - Explicit declarations always win; mutation runs against a clone of
 `parsed.data` so gray-matter's content-keyed cache is never poisoned.
- Camel-case aliases (`sourceProvenance`, `provenanceConfidence`, `createdAt`)
 exposed via the existing `.transform`. `sourceProvenance` defaults to
 `'unknown'` so consumers always see a value.
- `anvil skill list --verbose` adds `Source` / `Conf` columns; `--json`
 output unconditionally includes `source` / `confidence` / `created_at`
 on every row.
- New `anvil doctor` row **Skill provenance coverage** — warn-only at <80%
 declared coverage; never fails (provenance is editorial metadata).
 Live: `121 of 121 skills declare source (100.0% ≥ 80% threshold)`.

### Track 2 — `comment-analyzer` agent (Item 19)

`agents/comment-analyzer.md` (NEW) — read-only agent that inspects code
comments for staleness, contradictions, and AI-slop. LLM-backed companion
to v0.10.5's regex-grade `Skill content lint` doctor row: the row catches
lexical patterns; this agent catches the semantic ones.

- Tier `coding` (Sonnet medium); `output_schema: ReviewReport` (zero
 schema churn — reuses the existing shape).
- `required_reading` wires `skills/universal/code-review.md` per Item 23.
- `disallowedTools: [Edit, Bash]` — strictly read-only.
- Explicit "do NOT flag" guardrails for license headers, ADR rationale,
 domain-specific comments, public API docs, `SAFETY:` / `INVARIANT:` /
 `WARNING:` markers, owned `TODO(<owner>)` markers, and test-structure
 markers. Confidence rubric (≥80) drops style-preference noise.
- Agent count: 21 → 22.

### Track 3 — Reactive `runtime-fallback` hook (Item 14)

`src/hooks/handlers/runtime-fallback.ts` (NEW) — catches
`model_not_available` / `rate_limit_exceeded` envelopes on the `on-error`
event and emits a structured chain-advance decision. Reuses the proactive
consumer's retry budget via the new exported constant
`RUNTIME_FALLBACK_MAX_RETRIES = 2` (single source of truth in
`src/skills/runtime.ts`).

- Self-gating: opt-in via `workflow.runtime_fallback = true` config or
 `ANVIL_RUNTIME_FALLBACK=1` env. Default OFF — mirrors the gateguard
 pattern (Plan 43); registers unconditionally, short-circuits inside.
- `WorkflowConfig.runtime_fallback?: boolean` (default false).
- Decisions: `advance` | `budget-exhausted` | `no-chain` | `not-retryable`
 | `disabled` | `malformed-payload`. Every decision is JSONL-logged to
 `~/.anvil/logs/runtime-fallback.jsonl` so the safety net is observable.
 Logging failures never break the hook.
- Handler count 29 → 30; default user behavior unchanged.

### Test deltas

- 3550 → **3595** (+45). 0 skipped.
- New tests: `skill-frontmatter-provenance` (6), `loader-provenance-synthesis` (4),
 `skill-list-verbose` (3), `doctor-provenance-coverage` (4),
 `comment-analyzer-frontmatter` (10), `runtime-fallback` handler (8),
 `runtime-fallback-registration` integration (3).

### No backwards-compat shims

Per project convention, users reinstall. Existing skills without provenance
fields parse fine — synthesis fills defaults at load time. Hook count
delta is invisible to default users (handler self-gates).

### Carry-forwards

- Item 14's promotion gate (≥10 events/wk) is now observable via
 `~/.anvil/logs/runtime-fallback.jsonl`. v0.10.9+ can promote to default-on
 if traffic warrants.
- Items 20, 22, 28, 32, D-03 (Plan 41), D-04 (Plan 41) — gates still unmet.
 Stay deferred to v0.10.9+; backlog table refreshed accordingly.

## [0.10.6] - 2026-04-28

Hook handler refactor + targeted content/agent polish.
Plan: `docs/anvil/plans/2026-04-28-43-v0.10.6-hook-refactor-and-content-polish.md`.

### Track 1 — Hook handler refactor

Pays down the size debt surfaced by v0.10.5's `Hook handler size` doctor row. 9
handlers (originally 4 in the v0.10.5 backlog note; reality at v0.10.6 start was 9)
decomposed into a `<handler>.ts` shell ≤200 LOC plus 1–3 sibling helper modules
under `src/hooks/handlers/<handler>/`:

| Handler | Before | Shell after | Helpers |
|---|---:|---:|---|
| `gateguard.ts` (+ `gateguard-state.ts` folded in) | 267 + 248 | 98 | `state.ts`, `config.ts`, `policy.ts` |
| `workflow-guard.ts` | 396 | 178 | `source-detect.ts`, `config.ts`, `gates.ts` |
| `on-large-output.ts` | 400 | 119 | `threshold.ts`, `summarize.ts`, `notepad.ts` |
| `rules-prompt-injector.ts` | 351 | 137 | `rule-discovery.ts`, `artifact-summary.ts`, `subagent-guard.ts` |
| `spec-handlers.ts` | 297 | 25 | `runner.ts`, `prompt.ts`, `agent.ts` |
| `post-edit-accumulator.ts` | 241 | 74 | `state.ts`, `payload.ts` |
| `user-prompt-submit.ts` | 231 | 96 | `loaders.ts`, `active-state.ts`, `payload.ts` |
| `context-monitor.ts` | 230 | 128 | `bridge.ts`, `debounce.ts` |

Behavior preserved bit-for-bit — every existing test file passes unchanged. Public
surfaces (`loadAccumState`, `extractEditedPaths`, `contextBridgeFilePath`,
`countWords`, `loadRuleSkills`, etc.) preserved via shell re-exports so importers
don't move. `anvil doctor` `Hook handler size` row reports
`27 handler(s) within 200-LOC guidance`.

### Track 2 — `<required_reading>` enforcement (Item 23)

Opt-in subagent-context injection. New `AgentFrontmatter.required_reading?: string[]`
field; `prepareInvocation` reads each listed file and prepends a `<required_reading>`
block before the agent body. 8 KB total cap; on overflow the block is truncated with
an explicit marker. New `Required reading budget` doctor row warns when any agent
exceeds the cap.

Opt-in agents:
- `agents/orchestrator.md` → `[skills/universal/dispatching-parallel-agents.md]`
- `agents/ultra-worker.md` → `[skills/universal/autonomous-execution.md]`

### Track 3 — Item 28 viability dogfood recheck (Plan 39 D-04 / Plan 40 D-05)

Background researcher audited Plans 39–42 dogfood artefacts for SDD-chain
bypass evidence. Verdict: **NO-SIGNAL → reaffirm option A** (inline `REQUIRED
SUB-SKILL:` directives). Final report at
`docs/anvil/research/2026-04-28-d04-viability-dogfood-final.md`. The prior
deferred-skeleton report is marked superseded. v0.10.x-backlog Item 28 row
updated: promotion gate now requires telemetry capture mechanism in place
(or first manual `## Observed gaps` entry) before the recheck repeats.

No schema changes — `SkillFrontmatter.required_sub_skills?: string[]` (option C
plumbing) deferred indefinitely absent dogfood signal.

### Tests

3521 → 3550 (+29). Pre-existing failure in
`tests/integration/strict-flag-gateguard.test.ts` (unrelated; out of v0.10.6
scope) remains.

## [0.10.5] - 2026-04-28

Doctor fixes + per-language rules + content lint.
Plan: `docs/anvil/plans/2026-04-28-42-v0.10.5-doctor-fixes-content.md`.

### Item A — Doctor regression fix (P0)

The `models.json skill references` row validated group/override members against the skill
registry only — but shipped presets legitimately list **agents** as group members because
7-layer model resolution applies to both surfaces. v0.10.4-final reported `unknown skill(s):
orchestrator, researcher, framework-selector, …+7` on a clean install. v0.10.5:

- **Row renamed** `models.json skill references` → `models.json registry references`
 (accuracy: it validates the skill∪agent namespace, not skills alone).
- **Membership widened** to `skillNames ∪ agentNames`. Genuinely unknown names still fail.
- **Pure validator exported** as `validateModelsJsonReferences` for unit testing.

### Item B — Per-language rules: Rust, Java, Kotlin, PHP

v0.10.2 shipped `paths:`-scoped rules for TS/Python/Go (12 files). v0.10.5 completes the
high-traffic-language coverage:

- **16 new files** under `skills/languages/{rust,java,kotlin,php}/rules/{coding-style,patterns,security,testing}.md`.
- Each file mirrors the v0.10.2 template: `paths:` glob frontmatter, skill-not-agent body callout,
 Rules / Why / Done sections.
- **Skill count** 105 → 121.

### Item C — `anvil doctor --fix` and `--dry-run`

Five documented warns now have one-keystroke remediations:

- `--fix` runs the documented `anvil ...` command per known warn row (table at
 `FIXABLE_WARNS` in `src/commands/cli/doctor.ts`).
- `--dry-run` (with `--fix`) prints the plan without executing.
- **Dedup by command** — the 5 fixable rows collapse to 3 unique commands when all warn.
- **Fail rows are NEVER auto-fixed** — operator investigates root cause.
- Pure planner `planDoctorFixes` exported for unit tests.

### Item D — `Hook handler size` doctor row (preventive lint)

Promotes Item 25 from the v0.10.x backlog. New doctor row warns when any
`src/hooks/handlers/*.ts` exceeds 200 LOC (matching the existing `src/CLAUDE.md` guidance
"If a file grows past ~200 lines, consider splitting"). Today's run flags 4 handlers
exceeding the threshold (`workflow-guard.ts` 289, `on-large-output.ts` 267,
`rules-prompt-injector.ts` 226, `spec-handlers.ts`) — these become v0.10.6+ refactor
candidates. The row makes the debt visible while preventing further regression.

- New `countHandlerLoc` helper exported (excludes blanks, `//`/`/* */` comments, imports).
- Severity is `warn` only — never blocks CI.

### Item E — `Skill content lint` doctor row (preventive lint)

Promotes the regex-grade half of Item 19 (full LLM-backed `comment-analyzer` agent stays
deferred). New doctor row scans shipped `.md` bodies for three pattern types:

1. **Un-versioned TODOs** — `TODO/FIXME/XXX` markers without an `(v0.10.X)` tag.
 FP-resistant: markers must be followed by `:` or `(`. Bare prose mentions
 ("No TODO comments left behind") are not flagged.
2. **Broken plan cross-references** — `docs/anvil/plans/<filename>.md` links resolved
 against the working tree.
3. **Stencil leakage** — placeholder phrases (`your skill name here`, `lorem ipsum`,
 etc.). Backtick code-spans excluded so documentary mentions don't trip the match.

Today's run reports 142 files clean. Severity is `warn` only.

### Tests

- 3398 → 3522 (+124). 0 skipped.
- New unit suites: `doctor-registry-references-row`, `doctor-fix-flag`,
 `doctor-hook-size-row`, `doctor-content-lint-row`, `per-language-rules-presence`.

## [0.10.4] - 2026-04-28

Model-name hygiene + slug-namespace doctor hardening. Two tracks, single release.
Plan: `docs/anvil/plans/2026-04-28-41-v0.10.4-model-hygiene-namespace-hardening.md`.

### Track 1 — Model-name hygiene

Concrete provider model IDs (e.g. `claude-opus-4-7`) drifted across shipped artifacts after
v0.10.1 bumped the `opus` alias. The 4 preset JSONs were one version stale; slash docs and the
skill-scaffolding stencil cited concrete IDs in user-facing examples. Plan 41 D-01 establishes
a hard invariant: concrete IDs live only in `src/core/models/aliases.ts` (alias source-of-truth)
and `src/core/models/effort.ts` (capability registry). Everything else uses short aliases.

- **`presets/*.json` regenerated from `buildPreset`** — the 4 presets are now serialized
 snapshots of the TS builder (which was already using short aliases). New
 `scripts/regen-preset-snapshots.ts` keeps them in sync; new
 `tests/unit/core/config/preset-snapshot-drift.test.ts` fails the build on drift.
- **`src/commands/slash/model.md`** — examples lead with `cheap`/`balanced`/`best` aliases;
 concrete IDs only as a footnote escape hatch.
- **`src/commands/cli/skill.ts:138`** — skill-scaffolding stencil emits
 `preferred_model: balanced` (was the literal `claude-sonnet-4-6`).
- **`src/core/types.ts` JSDoc** — tier-config examples use short aliases.
- **`src/core/{CLAUDE,AGENTS}.md`** — `models/aliases.ts` description points at the SoT rule.
- **New invariant test** `tests/unit/core/models/concrete-id-allowlist.test.ts` — recursively
 greps `src/` and `presets/` for `claude-(haiku|sonnet|opus)-\d`; fails the build on any
 match outside the 2 allowlisted files.
- **New round-trip test** `tests/unit/core/models/preset-roundtrip.test.ts` — every preset
 alias resolves via `resolveAlias` to a concrete model ID known to `BUILTIN_SUPPORTED_EFFORTS`.
- **New `anvil doctor` row "Model id allowlist"** (per D-03 severity matrix):
 - `fail` on bundled `presets/*.json` containing concrete IDs
 - `warn` on user `~/.anvil/models.json` containing concrete IDs (user freedom)
 - `pass` otherwise; `skip` when neither in scope
 - detail message points users at `scripts/regen-preset-snapshots.ts`

### Track 2 — Slug-namespace doctor row escalation

- **`anvil doctor` "Slug-namespace integrity" row promoted warn → fail** per Plan 40 D-02
 escalation gate (v0.10.3 dogfood produced zero violation reports). The row now blocks
 doctor on real violations to prevent regression. Existing slug-namespace test updated
 from `expect('warn')` to `expect('fail')`.

### Backlog discoverability

- **`docs/anvil/plans/v0.10.x-backlog.md`** — new `## v0.10.5+ candidates (deferred from v0.10.4)`
 section indexes every deferred item (14, 19, 20, 21, 22, 23, 25, 28, 32, D-03 adaptive
 profile, D-04 banned-tool list) with rationale, promotion gate, and grep anchors.
- **`agents/ultra-worker.md`** — `TODO(v0.10.4 D-04)` marker bumped to `TODO(v0.10.5+ D-04)`
 so future-Claude grep'ing for v0.10.4 doesn't false-hit on the deferred banned-tool list.

### Tests

3382 → ≥3398 tests; 0 skipped (target +16 from new invariant/round-trip/snapshot/doctor-row tests).

## [0.10.3] - 2026-04-28

Namespace hygiene + low-risk content. Full feature reference: `docs/anvil/v0.10.3-namespace-hygiene.md`.
Plan: `docs/anvil/plans/2026-04-28-40-v0.10.3-resilience-auditability-namespace-hygiene.md`.
Audit: `docs/anvil/research/2026-04-28-slug-namespace-audit.md`.

### BREAKING

- **70 skill renames** to enforce the strict 3-shape grammar from `CLAUDE.md` § Naming rules.
 Agents end in approved doer-suffix (`-er`, `-or`, `-architect`, `-builder`, `-worker`, `-explorer`,
 `-orchestrator`, `-validator`, `-resolver`, `-surfacer`, `-selector`, `-analyzer`, `-simplifier`,
 `-verifier`, `-reviewer`, `-hunter`); skills MUST NOT end in any of these; commands begin with a verb.
 Zero agent renames; zero command renames.

 - **Group A — 12 skill+agent collisions resolved (skill renames; agents canonical):**
 `code-reviewer`→`code-review`, `code-simplifier`→`code-simplification`, `doc-verifier`→`doc-verification`,
 `framework-selector`→`framework-selection`, `mcp-builder`→`mcp-construction`, `orchestrator`→`orchestration`,
 `plan-verifier`→`plan-verification`, `researcher`→`research`, `silent-failure-hunter`→`silent-failure-discipline`,
 `subagent-executor`→`subagent-execution`, `test-analyzer`→`test-analysis`, `ultra-worker`→`autonomous-execution`.
 - **Group B — 30 universal skills with doer-suffix:** `brainstormer`→`brainstorming`,
 `changelog-generator`→`changelog-generation`, `claude-md-improver`→`claude-md-improvement`,
 `codebase-mapper`→`codebase-mapping`, `debugger`→`debugging`, `deep-diver`→`deep-diving`,
 `dependency-manager`→`dependency-management`, `design-system-generator`→`design-system-generation`,
 `developer`→`development`, `doc-writer`→`doc-writing`, `feature-developer`→`feature-development`,
 `github-worker`→`github-workflow`, `gitlab-worker`→`gitlab-workflow`, `git-worker`→`git-workflow`,
 `learner`→`learning`, `performance-profiler`→`performance-profiling`, `planner`→`planning`,
 `plan-writer`→`plan-writing`, `project-explorer`→`project-exploration`,
 `review-requester`→`review-requesting`, `review-responder`→`review-response`,
 `security-auditor`→`security-auditing`, `skill-creator`→`skill-creation`,
 `skill-orchestrator`→`skill-orchestration`, `skill-selector`→`skill-selection`,
 `slop-remover`→`slop-removal`, `summarizer`→`summarization`, `tdd-worker`→`test-driven-development`,
 `ui-designer`→`ui-design`, `verifier`→`verification`.
 - **Group C — 2 UI skills:** `color-palette-designer`→`color-palette-design`, `style-chooser`→`style-selection`.
 - **Group D — 26 language skills:** `<lang>-developer`→`<lang>-coding`, `<lang>-tester`→`<lang>-testing`,
 `<lang>-reviewer`→`<lang>-review`. Plus `ts-developer`→`typescript-coding`, `ts-typer`→`typescript-typing`,
 `js-*`→`javascript-*`.

 No backwards compatibility shims. Solo-user dogfood — full reinstall is the test path.

### Features

- **Body callouts.** Every renamed skill (and every language sub-rule) opens with:
 `> **Invoke via \`Skill({skill: "anvil:<slug>"})\`.** This is a skill, not an agent.`
 Every agent opens with the inverse `Agent({subagent_type: "anvil:<slug>"})` callout.
 Lexical guard at the slug level + body cue at invocation level — skill-vs-agent confusion
 becomes maximally unlikely for the model.

- **Skill-vs-agent decision tree.** `skills/universal/skill-orchestration.md` and
 `skills/universal/rules/orchestrator-first.md` host the new `## Decision tree —
 skill vs agent vs command` section: *"Does this need a fresh context window? → Agent.
 Is this a discipline / rule / methodology? → Skill. Is this a CLI / project-state action? → Command."*

- **Doctor lint row (non-blocking).** New `Slug-namespace integrity` row runs the 3 D-01
 invariants at runtime: no agent/skill collisions; agents end in approved doer-suffix;
 skills don't. Reports `pass` / `warn` / `skip`. Never fails per D-02 (escalation to
 hard-fail in v0.10.4 if dogfood shows contributors reintroducing violations).
 Synthetic test fixture at `tests/fixtures/synthetic-slug-collision/` exercises the warn path.

- **Anti-sycophancy cleanup in `agents/code-reviewer.md`.** Removes the "Strengths" /
 "What was done well" section template per empirical recommendation. Replaces
 with explicit *No praise sandwich* directive. Preserved: 3-level severity rubric
 (Critical / Important / Suggestion), confidence threshold (>=80), `ReviewReport` JSON
 schema, `review_type` tagging (Plan 30).

- **Ultra-worker `--auto` flag (shell).** `anvil ultra --auto` flips the agent into headless
 mode: pass-cap=5 (max plan-execute-verify-correct loops), per-pass tool budget=20.
 Runner pre-flight prepends a `<HEADLESS-MODE>` banner block to the dispatch prompt.
 **Banned-tool list is intentionally deferred to v0.10.4 D-04 finalization.**
 New exports `HEADLESS_MODE_BANNER`, `HEADLESS_PASS_CAP`, `HEADLESS_PER_PASS_TOOL_BUDGET`
 in `src/agents/runner.ts`.

### Tests

- 4 invariant tests in `tests/unit/naming/` (slug-no-collisions, agent-suffix-rule,
 skill-no-doer-suffix, expected-renames-v0.10.3). 144 parameterized assertions.
- 2 callout tests (`skill-vs-agent-callout.test.ts`, `decision-tree-rendered.test.ts`).
 139 parameterized assertions.
- Doctor lint test, anti-sycophancy test, ultra-worker `--auto` flag tests.
- v0.10.2 baseline 3046 → **v0.10.3: 3382 tests, 0 skipped (+336 net).**

## [0.10.2] - 2026-04-27

Track B content + workflow discipline overlays. Full feature reference: `docs/anvil/v0.10.2-content-overlays.md`.
Plan: `docs/anvil/plans/2026-04-27-39-v0.10.2-track-b-content-overlays.md`.

### Features

- **Per-language rules — 12 new skill files** (`skills/languages/{typescript,python,go}/rules/{coding-style,patterns,security,testing}.md`).
 Each file carries `paths:` frontmatter that CC uses to inject the skill only when the edited file matches the language's glob
 (`**/*.ts`, `**/*.py`, `**/*.go`, etc.). Additive overlays — no existing skills modified. Includes the `SkillFrontmatter.paths`
 Zod schema extension (`src/core/types.ts`) and CC manifest serialization path to make injection fire in practice.

- **Iron-law content sweep** — three skills extended with `letter = spirit:` header, `<HARD-GATE>...</HARD-GATE>` wrapper, and
 6-row rationalization tables: `skills/universal/tdd-iron-law.md`, `skills/universal/verification-before-completion.md`,
 `skills/universal/evidence-before-assertion.md`.

- **REQUIRED-SUB-SKILL chain** — inline cross-reference markers wire the 4-skill workflow chain:
 `brainstorm-spec` → `plan-writing` → `subagent-executor` → `finishing-branch` → `## CHAIN END — return to user`.
 Plain-text directives the model reads as authoritative routing instructions (D-04: option A over option C;
 runtime enforcement deferred to v0.10.3 viability check).

- **CSO description audit** — every skill `description:` field audited and rewritten as triggering-conditions only;
 workflow-summary anti-pattern eliminated across 80+ skills. Before/after report at
 `docs/anvil/research/2026-04-27-cso-audit-v0.10.2.md`. Non-blocking doctor lint row "CSO discipline" reports 0 issues
 post-audit.

- **GateGuard PreToolUse handler** (`src/hooks/handlers/gateguard.ts`) — blocks the first `Edit|Write|MultiEdit` per file
 per session until 4 observable facts have been gathered: (1) importers searched via Grep/Glob, (2) target file read via Read,
 (3) a schema/types file read, (4) a user instruction recorded from UserPromptSubmit. Off by default; activated by
 `workflow.gateguard=true` in `.anvil/anvil.config.json` or `ANVIL_GATEGUARD=1` env var.

- **GateGuard state tracker** (`src/hooks/handlers/gateguard-state.ts`) — combined PostToolUse + UserPromptSubmit handler
 that tracks Read/Grep/Glob events and user prompts into a session-scoped state file at
 `~/.anvil/state/gateguard-<sessionId>.json`. 24h TTL; per-process in-memory cache; never blocks.

- **`WorkflowConfig.gateguard`** field added to the workflow config schema (`src/core/types.ts`). Default `false`.
 Set `true` to enable GateGuard persistently for all sessions in a project.

- **`--strict` flag propagates GateGuard** on 5 CLI commands: `review`, `plan`, `debug`, `ultra`, `spec`. When `--strict`
 is passed, `ANVIL_GATEGUARD=1` is set for that invocation only (transient; does not write config).
 `buildStrictWorkflowConfig` now also sets `gateguard: true`.

- **Two new agents** — `build-error-resolver` (tier `coding`, minimal-diff scope; fixes build/typecheck errors without
 architectural changes) and `assumptions-surfacer` (tier `planning`; surfaces hidden assumptions between brainstorm-spec
 and plan-verifier). Both tier-resolved; appear in CC + OC manifests after install.

### Performance

- **Post-edit accumulator + stop-batch** (`src/hooks/handlers/post-edit-accumulator.ts`) defers per-edit format/typecheck
 to a single Stop-time invocation; measurable per-edit lint reduction. PostToolUse handler matches `Edit|Write|MultiEdit`,
 accumulates edited paths into `~/.anvil/state/edit-accumulator-<sessionId>.json` (24h TTL, per-process cache, Set-dedup).
 Stop handler reads the accumulator and runs `npx biome check --write <files>` + `npx tsc --noEmit` once per session.
 Integration perf test confirms format is invoked exactly 1 time for N=10 edits (vs. 10 times in the naive per-edit model).

### Refactoring

- Hook handler `src/hooks/handlers/comment-checker.ts` deleted; logic absorbed into
 `skills/languages/typescript/rules/coding-style.md` (see Breaking changes).
- Hook handler `src/hooks/handlers/ui-rules.ts` deleted; logic absorbed into `skills/universal/ui/rules.md` with `paths:`
 scoped to TSX/JSX/Vue/HTML/CSS/SCSS/Svelte (see Breaking changes).
- `src/installer/upgrade.ts` extended to emit delete-entries for both removed handlers in upgrade plans from v0.10.1.

### Tests

- Phase A (iron-law content): +14 tests.
- Phase B (CSO audit): +8 tests.
- Phase C (TypeScript rules + schema/serialization): +18 tests.
- Phase D (Python + Go rules): +16 tests.
- Phase E (hook removal): +6 tests net (after deletions).
- Phase F (GateGuard): **2997 tests** (was 2631 in v0.10.1). Net +366 (includes prior phases).
- Phase G (new agents): +12 tests.
- Phase H (post-edit accumulator): **3036 tests** (was 2997 post-Phase F). Net +39.
- Phase I (release prep): +10 tests.
- **Final: 3046 tests, 0 skipped.**

### Breaking changes

- `comment-checker.ts` and `ui-rules.ts` hook handlers removed. Existing installations that relied on these handlers
 will stop running them after upgrade. Coverage is preserved via the new `paths:`-scoped skill files — the enforcement
 mechanism moves from PostToolUse hook to CC context injection. **Full reinstall recommended:**
 `anvil uninstall && anvil init`. No migration shim provided (solo-user policy).

## [0.10.1] - 2026-04-27

### Major

- **Tier generalization + effort clamping.** The three-tier model (`quick`/`standard`/`deep`) is replaced by a six-tier task-typed system: `quick|coding|review|planning|ultra|super`. Each tier carries a fixed model alias (`cheap`/`balanced`/`best`) and an effort level; the alias chain makes tiers provider-portable. Legacy tier names `standard` and `deep` are removed; see migration note below.

### Added

- **`clampEffortForModel`** (`src/core/models/effort.ts`) — provider-extensible registry mapping model families to their supported effort levels. Haiku drops effort silently; Sonnet supports `low`/`medium`/`high`/`max`; Opus supports `low`/`medium`/`high`/`xhigh`/`max`. Resolver clamps out-of-range combinations rather than erroring (matching Claude Code behavior).
- **`AgentTier` enum extended** — `quick|coding|review|planning|ultra|super`. `TierConfig` gains `effort_range`; `fallback_chain` and `tiers.*` defaults updated to the six-tier taxonomy.
- **`--tier` CLI flag** — available on `review`, `plan`, `debug`, `ultra`, and `spec` commands. `ResolveOptions.cli.tier` carries the value through the 7-layer chain. Dispatch envelope for subagent fans includes a `tier` field.
- **19-agent model sweep** — all agents migrated from `model: opus|sonnet|haiku` to `tier: <tier>` frontmatter, making them provider-portable.
- **`anvil doctor` Tier integrity row** — verifies every installed agent's tier resolves to a known model without cycles; emits `warn` on unknown tier, `fail` on resolution cycle.
- **`docs/anvil/tiers.md`** — user-facing six-tier reference: overview, tier table, effort-per-model table, injection mechanisms, conflict resolution, provider-portability walkthrough, and when-to-use heuristics.

### Breaking

- `tier: standard` and `tier: deep` removed from `AgentTier` enum. Any agent frontmatter using these values will fail Zod validation. Migrate: `standard` → `coding` or `review`; `deep` → `planning` or `ultra`. (Decision D-04 from pre-release research.)
- Legacy tier aliases `standard`/`deep` dropped from `tiers.*` defaults in `models.json`.

### Tests

- Phase A (`clampEffortForModel`): 2192 tests (baseline).
- Phase F (`doctor Tier integrity`): 2631 tests.
- Phase G (docs): 2633 tests (2 new doc-fixture tests).
- 0 skipped throughout.

## [0.10.0] - 2026-04-27

### Major

- **SDD artifact layer.** New per-feature directories at `docs/anvil/features/<slug>/{spec,plan,tasks}.md` with Zod-validated frontmatter. New `anvil spec <slug>` CLI scaffolds the spec; `anvil plan --feature <slug>` consumes it. State machine: research → spec → plan → tasks → implement → verify → review → finish.
- **Layered workflow enforcement.** L1 skill-content `<HARD-GATE>` markup; L4 per-gate `workflow.*` config flags (no global env var); L5 phase-aware intent router with 28-case test matrix; L6 rules-prompt-injector artifact-summary block (≤1KB).
- **Model resolution v2.** 7-layer chain extending the prior 5-layer with `agents.<name>.model` and `agents.<name>.tier → tiers.<tier>.model`. Cycle rejection at parse time. `quick`/`standard`/`deep` tier aliases. Per-agent `agent_mode: primary | subagent`.

### Breaking

See `docs/anvil/plans/2026-04-26-37-v0.10.0-migration.md` for the full migration. 9 breaking changes; reinstall via `anvil uninstall && anvil init`.

### Added

- New CLI: `anvil spec <slug>`; new flags `--force` and `--strict` on `anvil plan` and `anvil ultra`
- New hook: `pre-compact.ts` snapshots state.json + artifacts on PreCompact
- Async hook dispatch (`async: true` flag in registration)
- Agent context-bridge (`/tmp/claude-ctx-<session>.json` via `os.tmpdir`)
- `<SUBAGENT-STOP>` guard prevents bootstrap double-injection
- Decision-coverage gate (`D-NN:` ID parsing in plan-verifier)
- Research gate (`## Open Questions` blocks plan-writing)

### Tests

2139 tests across 251 files (was 1836 / 222 in v0.9.2). 0 skipped.

## [0.9.3] - 2026-04-26

### Fixed

- **`(root): Invalid input` hook validation regression** — `entrypoint.ts` was emitting `hookEventName: kind` (kebab-case, e.g. `"user-prompt-submit"`) in the `hookSpecificOutput` envelope. Claude Code's HookOutput discriminated union expects PascalCase (`"UserPromptSubmit"`); the mismatch caused CC to reject with `(root): Invalid input`. Fix: entrypoint now maps via `HOOK_KIND_TO_EVENT` (already defined in `src/core/manifest-schema/claude-code.ts`) before building the envelope.
- **5-minute Stop hook latency** — same root cause as above. When CC rejected the malformed envelope it likely retried or hung until its own ~300 s subprocess timeout fired. Anvil's Stop handlers max ~3 ms; the latency was entirely downstream of the invalid envelope. Fixed by the PascalCase mapping above.
- **Per-kind envelope-vs-plain-text dispatch** — the entrypoint previously emitted the `hookSpecificOutput` JSON envelope for *any* hook kind when `systemInsert` was set. Claude Code only accepts `additionalContext` on UserPromptSubmit, SessionStart, and PreToolUse; emitting the envelope on Stop, SubagentStop, SessionEnd, PreCompact, Notification, PostToolUse triggered the same `(root): Invalid input` rejection. Fix: `KINDS_WITH_ADDITIONAL_CONTEXT` set guards envelope emission; all other kinds fall back to plain text stdout.

### Added

- **`validateAndTimeHandler` shared helper** (`src/hooks/wrap.ts`) — wraps a single handler invocation with: (1) configurable hard-abort timeout (default 30 s), (2) `validateOrFallback` schema validation at the output boundary, (3) timing instrumentation to `~/.anvil/logs/hook-timings.jsonl`. Entrypoint and dispatcher both converge on this code path, eliminating the structural bypass where `entrypoint.ts` called `handler(ctx)` directly and the dispatcher's validation + timing never ran on real-session hooks.
- **`src/hooks/cc-output.ts`** — Layer-2 shim for the CC hook output formatter. Mirrors the pure formatting logic from `src/adapters/claude-code/hook-output.ts` so `entrypoint.ts` (Layer 2) can use it without a cross-layer import from Layer 5 (adapters). The adapter's docstring documents this pattern.
- **`src/hooks/wrap.ts`** — standalone module with `validateOrFallback`, `appendTimingEntry`, and `validateAndTimeHandler`. Imports only `core/types.ts` and `exit-codes.ts` (no `on-large-output.ts`), ensuring it bundles cleanly to CJS for the `dist-hooks/` standalone binaries.

### Tests

- **225 files / 1864 tests / 0 skipped / 0 failed** (+3 test files, +28 tests vs v0.9.2).
- `tests/unit/hooks/entrypoint-envelope.test.ts` — for each kind in `KINDS_WITH_ADDITIONAL_CONTEXT`, asserts the envelope's `hookEventName` is PascalCase; asserts the kebab-case form is never emitted.
- `tests/unit/hooks/entrypoint-per-kind.test.ts` — asserts kinds outside `KINDS_WITH_ADDITIONAL_CONTEXT` are not in the envelope-emitting set; asserts all kinds still have valid PascalCase mappings in `HOOK_KIND_TO_EVENT`.
- `tests/integration/entrypoint-validation-fallback.test.ts` — validates `validateAndTimeHandler`: invalid shape → safe fallback + validation log entry; valid shape → result passthrough + timing log entry; no validation log on success.

### Carry-forwards closed

- v0.9.2 deferred: "Stop hook 5-min latency root-cause" → **fixed in v0.9.3** (same bug as the PascalCase mismatch).
- v0.9.2 deferred: "UserPromptSubmit `(root): Invalid input` root-cause" → **fixed in v0.9.3** (kebab-case `hookEventName` in envelope).

## [0.9.2] - 2026-04-26

### Added

- **Rich-mode statusline (default; `simple` opts back)** — `renderRich` ports the bash truecolor RGB-gradient renderer 1:1 into TypeScript. Features: 20-block context bar with green→yellow→red per-block gradient (`\033[38;2;R;G;Bm` truecolor escapes), `🟢⚡🔥🚨` emoji scaling at ctx% thresholds (<20/20-69/70-89/≥90), 7d + 5h rate-limit windows with reset-time formatting, `+N -M` code velocity from `git diff --shortstat HEAD`, `🌿 branch` + `🤖 model · effort` segments. **Visual change from v0.9.1:** the default render is now `rich`; users who prefer the simpler v0.9.1 bar can opt back via `anvil statusline template simple`.
- **`anvil statusline template <simple|rich>` CLI** — reads and writes `statusline.template` in `~/.anvil/models.json`. Slash parity: `/anvil:statusline-template [simple|rich]`.
- **Effort segment side-by-side with model on every render** — both `simple` and `rich` templates always show `model · effort`; the effort segment is no longer hidden when effort equals `default`.
- **Per-handler timing instrumentation** — `dispatcher.ts` wraps each handler with `performance.now`; durations logged to `~/.anvil/logs/hook-timings.jsonl` (rolling, 7-day retention).
- **30-second dispatcher timeout safeguard** — any handler exceeding 30 s is aborted with a stderr warning and returns a safe `{exitCode: 0}` result, bounding worst-case Stop lifecycle latency.
- **Expanded UserPromptSubmit failure telemetry** — input/output captured on every validation failure; `~/.anvil/logs/hook-validation-failures.json` rotation added.
- **`Hook latency budget` doctor row** — reads `hook-timings.jsonl`; warns if any handler exceeded 5 s; fails if any exceeded 30 s.
- **`Hook output validation` doctor row updated** — now counts last-24h failures from the validation log.
- **`SLASH_ONLY_COMMANDS` parity exclusion** — `src/commands/cli/common/cli-parity.ts` gains a `SLASH_ONLY_COMMANDS` set. The `agents` slash command is included; the parity row and integration test both skip commands in this set when looking for missing CLI counterparts.
- **Manual summarization smoke script** — `scripts/manual-tests/summarizer-live-sdk.ts` replaces the former env-gated `ANVIL_LIVE_SDK_TESTS=1` test. Run with `bun run smoke:summarization` before release to validate the real SDK path.
- **Versioned CC manifest fixture** — `tests/fixtures/cc-manifest-schema-sample.json` (798 bytes) replaces the gitignored `references/` fixture path; drops the `HAS_REFS` gate.

### Changed

- **Default statusline template: `simple` → `rich`** — On upgrade, users will see the new truecolor RGB-gradient bar. To restore the v0.9.1 simpler bar: `anvil statusline template simple`. This is the most visible change in v0.9.2.
- **`anvil statusline install` default scope: `project` → `global`** — Shipped in v0.9.1; this release ships `template: rich` as the new default on top of that scope change.
- **Doctor `runtimeCliDir` fallback** — fixes the 35-issue parity false-positive when running from the installed bundle (the resolved CLI dir now falls back to `process.execPath` when the source `dist/` is absent).

### Fixed

- **AGENTS.md doctor row** — when `installedTarget === null` (manifest absent or pre-v0.9.0 install) and AGENTS.md exists without the anvil-routing marker, the row now returns `skip` (project-owned file) instead of `fail`. The `.opencode/` heuristic was too aggressive when the manifest is absent.
- **`skill registry health` and `agent runtime preconditions`** — both rows now render `skip` (not `warn`) when invoked from a non-project cwd. The detail string already said "skipped"; the status now matches.
- **Statusline doctor command hints** — corrected to point at `anvil statusline install --scope project` (was incorrectly citing a different subcommand path).

### Tests

- **222 files / 1836 passing / 0 skipped** (was 215 / 1741 / 8 in v0.9.0).
- Bash-parity 6 tests un-deferred — `BASH_PARITY_DEFERRED = false`; all pass against the new `renderRich` output.
- `compression-summarizer-roundtrip.test.ts` rewritten as a fully-mocked subprocess test (no `ANVIL_LIVE_SDK_TESTS=1` env gate).
- `manifest-schema/claude-code.test.ts` drops `HAS_REFS` gate; uses versioned `tests/fixtures/cc-manifest-schema-sample.json` fixture.

### Deferred to v0.9.3

- **Stop hook 5-min latency root-cause** — the 5-minute Stop lifecycle latency reported by user could not be reproduced in a 4-hour investigation timebox. Anvil's handlers max 3ms; latency origin is unknown (likely a user-installed hook or CC runtime). Per-handler timing instrumentation and the 30s safeguard ship in this release to enable future diagnosis. Root-cause fix deferred to v0.9.3.
- **UserPromptSubmit `(root): Invalid input` root-cause** — the intermittent validation error reported after Plan 33 J's fix could not be reproduced. Likely structural in `entrypoint.ts` (calls `handler(ctx)` directly, bypassing dispatcher's `validateOrFallback`; CC runtime parses hook stdout before Anvil's wrapper takes over). Expanded telemetry ships in this release. Root-cause fix deferred to v0.9.3.

## [0.9.1] - 2026-04-26

### Fixed
- **Statusline bash-parity test pinned to versioned fixture** at `tests/fixtures/statusline-bash-reference.sh` (snapshot of the canonical truecolor RGB-gradient renderer). v0.9.0 read from gitignored `references/statusline-command.sh` and drifted whenever the local file diverged. The fixture is now in version control.
- **`anvil init` wires the statusline into `~/.claude/settings.json`**. v0.9.0 shipped `anvil statusline install` as a separate command; the user-scope CC wiring (`wireClaudeCodeUser`) now best-effort merges `{statusLine: {type:'command', command:'<anvilBin> statusline'}}` into the user's global settings.json on first install. Non-fatal — install never aborts on a statusline merge error; `anvil statusline install` remains the explicit recovery path.

### Changed
- **`anvil statusline install` default scope: `project` → `global`**. Statusline is typically a desktop-wide visual; defaulting to `global` matches the common case. Pass `--scope project` to scope per-repo.

### Known issues
- **`tests/integration/statusline-bash-parity.test.ts` is `describe.skip`'d**. The pinned bash reference is the rich truecolor RGB-gradient renderer (20-block context bar with per-block gradient, scaling emoji, code velocity, etc.); the TS `renderBashEquivalent` produces a simpler output that no longer matches byte-for-byte across all 6 fixtures. Re-enabling requires upgrading TS render to match the bash quality bar — tracked as a v0.10.0 candidate in `docs/roadmap.md`.

## [0.9.0] - 2026-04-26

### Composability (Plan 33 A + B)

- **`sub_skills:` nested chain composition** — `SkillFrontmatter` gains a `sub_skills: string[]` field. The runtime schedules each child in declared order before the parent body runs; the parent body receives a `<sub-skill-outputs>` block in its conversation context and acts as a coordinator. `sub_skills` and `chains` are mutually exclusive on the same skill (loader rejects both). Missing children append a `defects[]` entry on the parent (degraded mode); cycles raise `SkillCycleError` at startup. Canonical proof-of-concept: `ui-design` coordinates `[color-palette-design, typography-pairings, style-selection]`. `anvil doctor` row: count + degraded skills + cycles. New: `SkillGraph` type in `src/core/types.ts`; `SkillCycleError` export from `src/skills/errors.ts`.
- **`output_schema:` / `input_schema:` on cross-agent boundaries** — optional Zod-shorthand schema fields on `SkillFrontmatter` and `AgentFrontmatter`. `parseSchemaField` helper validates schema names against exported Zod types in `src/core/types.ts`. Runner validates input at call boundary (→ `SCHEMA_FAIL`) and output at return boundary (→ `DONE_WITH_CONCERNS`, never blocking). Four verification agents adopted with self-test gate: `code-reviewer` (`ReviewReport`), `plan-verifier` (`PlanAuditReport`), `spec-reviewer` (`ReviewReport` + `review_type: spec-compliance`), `code-quality-reviewer` (`ReviewReport` + `review_type: code-quality`). Doctor row: "Output schema coverage".

### Plan 32 closures (Plan 33 C + D)

- **Real summarization SDK wiring** — `on-large-output` hook now invokes the `summarization` skill via subprocess (`bun → tsx → node` fallback chain). The subprocess is spawned by the hook handler; if it fails, the mechanical summary (file paths + error names + head/tail) is used as fallback — output is never lost. New `anvil skill run <name> --input-stdin` CLI for direct invocation. Doctor row: "Subprocess runtime" reports which runtime was detected.
- **`fallback_chain` runner consumption** — `isRetryableSDKError` helper detects `model_not_available` / `rate_limit_exceeded` from SDK error responses. Skill runner and agent runner both implement a retry loop that steps through `fallback_chain` entries on retryable errors, capped at 2 retries (3 attempts total). The original error surfaces after the cap. Skill runtime mirror has the same loop. `anvil model resolve <name>` prints "Chain consumption: live" to confirm the loop is active.

### Install/hook correctness (Plan 33 H + I + J)

- **Doctor cwd-awareness** — `isProjectRoot` helper detects whether cwd contains a project root. Project-specific rows (`CC settings template`, `AGENTS.md routing block`, etc.) now emit `skip` status with a gray glyph instead of `fail` when invoked from a non-project directory (e.g. `~/.claude`). New `skip` variant added to `CheckStatus` enum in `src/core/types.ts`.
- **AGENTS.md doctor 5-case logic** — `installedTarget` field added to `~/.anvil/manifest.json`. Doctor reads it to distinguish 5 cases: (1) installed `--target claude-code` only → skip (OC routing block not relevant); (2) installed `--target opencode|both` + block present → pass; (3) installed `--target opencode|both` + block missing → fail; (4) not installed → skip; (5) block present but not installed → warn (stale artifact).
- **Hook output-validation guard** — dispatcher boundary now runs `HookResult.parse` on every handler return. Validation failures are logged to `~/.anvil/logs/hook-validation-failures.json` (append, JSON lines) and the hook result is replaced with a safe empty `HookResult`. `UserPromptSubmit` hook shape regression fixed (was returning extra fields rejected by the strict schema). 22 handler unit tests updated with shape assertions; new `tests/integration/hook-dispatcher-shape.test.ts`. Doctor row: "Hook output validation" — shows failure count from log file.

### Statusline install closure (Plan 33 E)

- **`anvil statusline install --scope global|project`** — new subcommand that wires the Anvil statusline into either project (`<cwd>/.claude/settings.json`) or global (`~/.claude/settings.json`) Claude Code settings. `--scope project` is the default (matches prior `anvil init --statusline` behavior). `--scope global` is new: merges `statusLine.command` into `~/.claude/settings.json`, closing the gap where users with a pre-existing global settings.json weren't getting the Anvil command.
- **`--mode anvil|shell-script`** — selects the renderer. `anvil` (default) wires the TypeScript renderer (`<anvilBin> statusline`). `shell-script` copies `templates/statusline.sh` to the target scope directory and wires `bash <path>/statusline-command.sh`.
- **`--force`** flag — overwrite an existing custom `statusLine.command` without prompting. Without it, custom commands are preserved and a warning is emitted.
- **Idempotent** — re-running the same args produces no diff.
- **`templates/statusline.sh` upgraded to truecolor-RGB-gradient** — the default shell-script template now matches the richest known quality bar: 20-block context bar with green→yellow→red per-block gradient via `\033[38;2;R;G;Bm` escapes, `🟢⚡🔥🚨` emoji scaling with ctx%, 7d + 5h usage windows with reset times, `+N -M` code velocity from `git diff --shortstat`, `🌿 branch` + `🤖 model`. Requires `jq`, `awk`, `date`, `git` (bash, not POSIX sh). Old 66-line POSIX-only template replaced.
- **Doctor drift detection** — project scope statusline check now distinguishes `anvil` / `anvil-shell` / `custom` / `missing`. New global scope row added: when `~/.claude/settings.json` has a non-anvil `statusLine.command`, doctor surfaces a `warn` row with `anvil statusline install --scope global --mode anvil` migration hint.
- **Slash command** `/anvil:statusline-install` added for CC slash menu parity.

### Install-source resilience (Plan 33 G)

- **Runtime mirror at `~/.anvil/runtime/`** — the installer now copies `dist/` and `dist-hooks/` from the source repo into `~/.anvil/runtime/` as part of the install (via `syncAnvilHome`). The mirror is atomic: written into a staging directory first and renamed in one shot, so a mid-install failure never leaves a half-populated runtime.
- **Resilient user-facing shims** — `~/.anvil/bin/anvil.cjs` and `~/.anvil/bin/install.cjs` no longer embed an absolute `repoRoot` pointing at the install-time source path. Both now resolve `homedir + /.anvil/runtime/` at startup. If the runtime is missing, they print a clear recovery message and exit 1 instead of crashing with `ERR_MODULE_NOT_FOUND`.
- **Self-contained bundle** — the runtime ships `dist/anvil-bundle.cjs` (main CLI) and `dist/installer-bundle.cjs` (installer CLI), produced by `esbuild` with all npm deps inlined. No `node_modules/` needed at runtime.
- **`npm run build` now includes the bundle step** — `scripts/build-bundle.mjs` runs after tsc and build-hooks as part of the standard build.
- **Bun fast-path dropped from user-facing shims** — the `hasBun` + `bun src/index.ts` branch is removed because the source tree may not exist; users who want the Bun fast-path run `bun src/index.ts` directly from a source checkout.
- **Source-tree shims unchanged** — `./install.sh` and `./uninstall.sh` continue to invoke the source-resident `bin/anvil.cjs` directly (not the user-facing shims).
- **Recovery docs** — new `docs/installation.md#recovery` section documents the runtime-mirror behavior and the recovery procedure for users whose runtime is missing or corrupt.

### Misc (Plan 33)

- **`isProjectRoot` helper** (`src/core/project/detect.ts`) — exported utility; used by doctor cwd-awareness.
- **`installedTarget` field in `~/.anvil/manifest.json`** — tracks `claude-code | opencode | both`; written by installer; read by doctor.
- **`parseSchemaField` helper** (`src/core/types.ts`) — resolves Zod schema name strings to live Zod schemas at runtime; used by schema-bearing runner validation.
- **`isRetryableSDKError` helper** (`src/core/models/retry.ts`) — detects `model_not_available` / `rate_limit_exceeded` from SDK error shapes.
- **`SkillGraph` type** (`src/core/types.ts`) — `{ nodes: Map<string, string[]> }` built by loader second pass.
- **`SkillCycleError`** (`src/skills/errors.ts`) — thrown at startup on detected sub-skill cycles; full cycle path in message.

### Tests (Plan 33)

- 215 test files / 1741 tests (was 200 / 1543 in v0.8.0).
- New: `tests/unit/skills/sub-skills-resolve.test.ts`, `tests/unit/skills/sub-skills-runtime.test.ts`, `tests/integration/sub-skills-ui-designer.test.ts` (Phase A).
- New: `tests/integration/output-schema-roundtrip.test.ts` (Phase B).
- New: `tests/integration/hook-dispatcher-shape.test.ts` (Phase J); 22 handler unit tests updated with shape assertions.
- New: `tests/integration/resilience.test.ts` (Phase G).

## [0.8.0] - 2026-04-26

### Token discipline

- **Lazy skill loading** (`skills.lazy_load: true` in `~/.anvil/models.json`) — frontmatter-only load with body-on-demand. 50.5% CC / 52.3% OC manifest reduction; 2.7× faster startup.
- **`on-large-output` hook + auto-stash to notepads** — large tool outputs (>5000 words by default) get a mechanical summary in conversation context; raw output stashed to `.anvil/notepads/<branch>/large-outputs.md`. Note: summary is mechanical (file paths + error names + head/tail), not SDK-backed; full model-summary path tracked for v0.9.
- **Prompt-cache stable prefixes** on `orchestrator`, `ultra-worker`, `code-reviewer` agents.

### Statusline closure

- **Week's Usage window (`7d:`)** + **context-window percentage (`ctx:`)** promoted into the default tier.
- **`anvil statusline tier <minimal|default|maximal>`** CLI + slash command.
- Doctor surface for current tier.

### Resilience + parity

- **`fallback_chain`** extended to `ModelGroup` and `ModelOverride`. Resolver picks the highest non-empty layer; runner has plumbing for cascading retries (consumption deferred to v0.9).
- **OpenCode standing-instructions parity** — installer writes `<!-- anvil-routing -->` block to repo-root `AGENTS.md` on `--target opencode|both`. Idempotent, marker-fenced. ADR at `docs/anvil/specs/2026-04-26-opencode-standing-instructions.md`.
- Doctor surfaces for compression hook + OC standing instructions.

### Misc

- Plan 31 frontmatter flipped from `status: planned` to `status: complete` (PR #45 merged 2026-04-25).
- Biome format sweep on notepad + session-start surfaces.
- Test suite: 200 files / 1543 tests (was 194 / 1478).

## [0.7.0] — 2026-04-25

### Added

- **`HookResult.systemInsert` lane** (`src/core/types.ts`). New optional field on `HookResult`; the adapter translates it to the platform-native model-visible injection mechanism: `hookSpecificOutput.additionalContext` on Claude Code (10KB cap, UTF-8-safe truncation) or a prepended system-role message on OpenCode. The `message` field continues to carry user-visible stdout text. (Plan 31 B1.)
- **Path E injection — Claude Code adapter** (`src/adapters/claude-code/hook-output.ts`). `formatClaudeCodeHookOutput` wraps `systemInsert` in the `hookSpecificOutput` JSON envelope (≤10KB, truncated with `\n…(truncated)` suffix, never splitting a multi-byte codepoint). The user-visible `message` is written to stderr when the model-visible envelope occupies stdout. (Plan 31 B2.)
- **Path E injection — OpenCode plugin** (`src/opencode-plugin/index.ts`). `transform` reads `.anvil/active-routing.json`; if `systemInsert` is set and the `<!-- anvil-routing -->` marker is not already in the messages, prepends a `system`-role message. Idempotent: the marker prevents double-injection across turns. (Plan 31 B3.)
- **`.claude/rules/anvil-routing.md` standing instructions** (`src/installer/install.ts`). Installer writes a canonical routing-preference file on install. Idempotent: if present and byte-identical, skip; if divergent, write `.new` sibling and emit a non-blocking warning; auto-overwrite only with `--force`. (Plan 31 B5.)
- **`disambiguator` field** on `SkillFrontmatter` and `AgentFrontmatter` (`src/core/types.ts`). When set, the loader prefixes `description` with `Anvil's <disambiguator>: <original>` (cap 200 chars). Applied to 7 colliding surfaces: `planning`, `code-reviewer`, `researcher` skills and `orchestrator`, `code-architect`, `researcher`, `ultra-worker` agents. (Plan 31 C1–C3.)
- **`skill-orchestration` meta-skill** (`skills/universal/skill-orchestration.md`). Default-on guard with `<EXTREMELY-IMPORTANT>` block; defers to active high-confidence directives. Auto-loaded via SessionStart `systemInsert`. (Plan 31 C4.)
- **`docs/anvil/output-conventions.md`** — canonical output-section spec. Defines required sections (`## Status`, `## Plan`, `## Findings`/`## Changes`/`## Output`, `## Done`), four-state completion vocabulary, and agent start/end marker contract. (Plan 31 D1.)
- **Four-state completion vocabulary** across 13 atomic skills and all 16 agents: `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, `BLOCKED`. (Plan 31 D2/D5.)
- **Output-marker lint test** (`tests/unit/output-conventions.test.ts`). Static lint verifies `## Status` opener, four-state `## Done` vocabulary, severity taxonomy on `code-reviewer`, and completion templates on `git-workflow`, `github-workflow`, `doc-writing`. (Plan 31 D6.)
- **Severity taxonomy on `code-reviewer` skill** (`skills/universal/code-reviewer.md`). Critical / Important / Minor findings sections with file:line references, merged-readiness verdict. `review_type` tagging from Plan 30 `ReviewReport` is preserved. (Plan 31 D4.)
- **Silent skill fills** (`git-workflow`, `github-workflow`, `doc-writing`). Structured completion templates: `## Commit Status` (SHA, branch, files, commit header), `## PR Created — #<num>` (URL, base, CI next-step), `## Documents Written` (file paths, sections). (Plan 31 D3.)
- **Verifier auto-chain** (`skills/universal/feature-development.md`). Added `before: verification` to `chains:` so verification runs automatically after feature-development. (Plan 31 E1.)
- **Two-stage review framework** (`skills/universal/two-stage-review.md`, `agents/spec-reviewer.md`, `agents/code-quality-reviewer.md`). Extracted from `subagent-executor` into reusable standalone units. Both review agents are read-only (Read/Grep/Glob only); both emit `ReviewReport`-shaped JSON with `review_type` tags. (Plan 31 E2.)
- **`plan-writing` template polish** (`skills/universal/plan-writing.md`). Required header sections, `- [ ]` checkboxes, no-placeholders rule. (Plan 31 E4.)
- **`anvil finish` CLI + `finishing-branch` skill** (`src/commands/cli/finish.ts`, `src/commands/slash/anvil-finish.md`, `skills/universal/finishing-branch.md`). 4-option menu (merge/PR/keep/discard); blocks on test failure before showing options; cleanup table. (Plan 31 E5.)
- **HARD-GATE blocks** in `brainstorming`, `test-driven-development`, `debugging` skill bodies. (Plan 31 E6.)
- **Announce pattern** enforced on top-12 skills and all agents. (Plan 31 E7.)
- **Atomic commit rule** appended to `git-workflow.md`. (Plan 31 E8.)
- **Notepads module** (`src/core/notepads/`). Per-branch token-bounded breadcrumb system: `loadRecentContext`, `appendEntry`, `readSection`, `compact`. Branch slug derived from git branch name; safe for detached HEAD, long names, special chars. (Plan 31 F1.)
- **`notepads_section` field** on `SkillFrontmatter` and `AgentFrontmatter` (`src/core/types.ts`). Skill/agent runtime appends to the named section after a successful run; headline extracted from first H2/H3 or first non-empty line ≤80 chars; silent-skip on empty. (Plan 31 F2.)
- **`anvil notepad` CLI** (`src/commands/cli/notepad.ts`). Subcommands: `init`, `read`, `write`, `list`, `clean`, `validate`, `compact`, `archive`, `restore`. (Plan 31 F3.)
- **Slash counterparts** `anvil-notepad-read` and `anvil-notepad-write` (`src/commands/slash/`). (Plan 31 F4.)
- **SessionStart notepad auto-load** (`src/hooks/handlers/session-start.ts`). Loads `recent-context.md` for the current branch (≤500 tokens ≈ 2000 chars via chars/4 approximation) and emits on `systemInsert`. (Plan 31 F5.)
- **Skill ↔ notepad section wiring** (`researcher`→learnings, `brainstorming`+`code-architect`→decisions, `debugging`+`silent-failure-hunter`→issues, `verification`+`code-reviewer`+`test-analyzer`→verification, `orchestrator`+`feature-development`→problems). (Plan 31 F6.)
- **`.gitignore` defaults** updated by installer to include `.anvil/notepads/`, `.anvil/archive/`, `.anvil/active-routing.json`. (Plan 31 F7.)
- **`notepads.profile` on `anvil.json`** (`src/core/types.ts`). Values: `minimal` (200 tokens) / `standard` (500 tokens, default) / `strict` (1000 tokens). Layer: project config, not `models.json`. (Plan 31 F8.)
- **`chainPreview` field on `RoutingDecision`** (`src/core/types.ts`). Populated by `buildRoutingDecision` via `composeChain`. (Plan 31 G1.)
- **Chain preview in directive output** (`src/core/routing-banner.ts`). When `chainPreview.length > 0`, renders `chain: planning → feature-development → verification → …` line. (Plan 31 G2.)
- **Semantic-fallback intent matcher** (`src/intent/semantic-fallback.ts`). Jaccard word-overlap scoring as a secondary pass when primary detection is empty or below confidence floor. Confidence capped at 0.65 to never produce directives from fallback alone. (Plan 31 G3.)

### Changed

- **`directive_threshold` default lowered 0.75 → 0.65** (`src/intent/router.ts`). Empirically validated in `docs/anvil/research/2026-04-25-empirical-routing-test.md`; expected directive rate 6% → 85%. (Plan 31 A1.)
- **7 new intent keyword patterns** (`src/intent/intents.ts`). Covers `autonomous` ("polish", "ship", "make it better"), `explore` ("what does", "how do i"), `debug` ("this is broken"), `refactor` ("speed it up"), `autonomous` ("create a new endpoint"). (Plan 31 A2.)
- **Registry pre-loaded at SessionStart** (`src/hooks/handlers/session-start.ts`). Skill and agent names stashed in `.anvil/registry.json`; `user-prompt-submit` reads this to pass live Sets to the router. (Plan 31 A3.)
- **`ProjectContext` passed to `route`** (`src/hooks/handlers/user-prompt-submit.ts`). Reads `.anvil/project.json` written by SessionStart; router's `applyContextSignals` consumes it. (Plan 31 A4.)
- **Multi-intent confidence reweighting formula** (`src/intent/router.ts`). New formula: `(top + 0.3*secondary) / (top + secondary + rest)`. Strong primary + weak secondary stays high; flat distributions stay low. (Plan 31 A5.)
- **`ANVIL_DIRECTIVE_THRESHOLD` env var override** (`src/intent/router.ts`). Parsed float, clamped [0.25, 0.95]; overrides `models.json` override and default. Precedence: CLI > env > models.json > default. (Plan 31 A6.)
- **`.strict` applied to `AgentFrontmatter`, `HookResult`, `RoutingDecision`** (`src/core/types.ts`). Rejects unknown-field typos at parse time. `SkillFrontmatter` intentionally excluded — real skills may carry CC-native fields (e.g. `color:`) not in Anvil's schema. (Plan 31 H3.)
- **`CLAUDE.md` plans table** row 31 added as Complete; rows 28/29/30 marked Complete. Skills and agents `CLAUDE.md` refreshed with v0.7.0 guidance. (Plan 31 H7/H9.)
- **`docs/roadmap.md`** updated with Plan 31 shipped summary and P3 deferrals section. (Plan 31 H8.)

### Tests

- **~270 new tests**, total now ~1380 across 189 test files.
- New: threshold boundary tests (`tests/unit/intent/router.test.ts` +5), ANVIL_ROUTING_BANNER suppression integration (`tests/integration/hooks/user-prompt-submit.test.ts`), strict-schema rejection (`tests/unit/core/types.test.ts` +5), session-start contract (`tests/unit/hooks/handlers/session-start.test.ts` +5), adapter parity (`tests/integration/adapter-parity.test.ts` +5), dispatcher matcher/ifRules (`tests/unit/hooks/dispatcher.test.ts` +4).

### Deferred

- **Comment-checker hook** — defer to Plan 32+.
- **Instinct-based continuous learning** — defer to Plan 32+.
- **Hook profile gating (`ANVIL_HOOK_PROFILE`)** — defer to Plan 32+.
- **Vector search / embeddings on notepads** — defer; current design relies on date-bounded sections.
- **Cross-branch notepad memory** — defer; per-branch is sufficient for v0.7.
- **OpenCode slash menu / standing-instructions analog** — blocked on OpenCode.
- **C4 `skill-orchestration` EXTREMELY-IMPORTANT scaling validation** — revisit after v0.7.0 routing metrics. Tracked as P3 in roadmap.

## [0.6.0] — 2026-04-25

### Added

- **Two-stage code review** (`agents/code-reviewer.md`, `src/core/types.ts`). The code-reviewer agent now runs two sequential passes: Pass 1 (spec-compliance) must pass before Pass 2 (code-quality) runs. A spec-compliance failure halts the review — code quality is skipped and marked `skipped: true` in the report. This prevents burning quality-review budget on diffs that fail basic spec requirements. (Plan 30 Phase A.)
- **`anvil review --type spec-compliance|code-quality|both`** (`src/commands/cli/review.ts`, `src/commands/slash/review.md`). Filter which review pass runs. Default: `both`. `--strict-review` dispatches `strict-reviewer` for adversarial analysis. Slash parity. (Plan 30 A3.)
- **`strict-reviewer` agent** (`agents/strict-reviewer.md`). Adversarial reviewer that names the tradeoffs a change locks in, long-term risks, and what it would refuse to merge. Distinct from `code-reviewer` (which balances severity + confidence). Used selectively for high-stakes diffs; fires on demand, not in the default chain. (Plan 30 B2.)
- **`anvil plan-audit <plan-file>`** (`src/commands/cli/plan-audit.ts`, `src/commands/slash/plan-audit.md`). Runs `plan-verifier` against a plan and emits a structured `PlanAuditReport`. The orchestrator dispatches plan-verifier after plan-writing and before subagent-executor. Slash parity. (Plan 30 B3.)
- **`anvil plan-validate-coverage <plan-file>`** (`src/commands/cli/plan-validate-coverage.ts`, `src/core/validation/detect.ts`). Maps each plan task to the test command(s) that verify it; writes `<plan-name>-validation.md` alongside the plan. `subagent-executor` and `anvil ultra` refuse to run without a validation map (override: `--no-coverage-gate`). Slash parity. (Plan 30 C4.)
- **`retroactive-validator` agent** (`agents/retroactive-validator.md`). For plans executed before validation tooling existed — audits the current codebase, fills test gaps, and emits a `*-validation.md` file retroactively. (Plan 30 C6.)
- **`anvil plan-check-decisions <plan-file>`** (`src/commands/cli/plan-check-decisions.ts`). Parses `<decisions>` blocks in plans and specs; verifies every decision id is referenced by at least one task. `--strict` exits 1 on any uncovered decision. `--json` emits `DecisionCoverageReport`. Slash parity. (Plan 30 D2.)
- **`brainstorm-spec` skill** (`skills/universal/brainstorm-spec.md`). Reads the codebase, surfaces structured assumptions, and writes a `<goal>-spec.md` with a `<decisions>` block. `--assumptions-first` skips Q&A and auto-generates assumptions. The `plan-writing` references this spec; decision ids carry through to task coverage. (Plan 30 E1.)
- **Hard-gate: `--require-spec` on `ultra-worker`** (default ON). `agents/ultra-worker.md` and `agents/orchestrator.md` refuse to execute when `--require-spec=true` and no `*-spec.md` is found. Override: `--require-spec=false`. (Plan 30 E2.)
- **Spec template** (`templates/spec-template.md`). Blank spec scaffold shipped with `anvil init`, matching the brainstorm-spec output format. (Plan 30 E4.)
- **Orchestrator `@parallel N` directive** (`agents/orchestrator.md`). Spawns N background subagents concurrently; results written to `.anvil/background-results.md`. (Plan 30 F1.)
- **`read-background-results` helper skill** (`skills/universal/read-background-results.md`). Reads and merges `.anvil/background-results.md` into the current context after a parallel pool completes. (Plan 30 F2.)
- **`anvil orchestrate <goal> --parallel=N`** (`src/commands/cli/orchestrate.ts`, `src/commands/slash/orchestrate.md`). CLI + slash surface for the parallel background pool. Slash parity. (Plan 30 F3.)
- **`anvil model <id> [--effort <level>]`** (`src/commands/cli/model.ts`, `src/commands/slash/model.md`). Mid-session model override; writes to `.anvil/active-model.json`; resolved at the ENV layer above `models.json` group defaults. `anvil model reset` clears the session override. Slash parity. (Plan 30 G1.)
- **Per-skill `eval_fixtures` in frontmatter** (`src/core/types.ts`, `src/commands/cli/skill.ts`). Skills declare eval inputs, expected keywords, and minimum scores directly in YAML frontmatter; `anvil skill eval <name>` reads them without a separate YAML file. (Plan 30 G2.)
- **Skill versioning fields** (`src/core/types.ts`). New optional `SkillFrontmatter` fields: `version`, `breaking_changes_in[]`, `replacement`. `anvil doctor` warns when a skill is below the user's pinned version in `models.json`, when a skill declares `replacement` (deprecated), or when `breaking_changes_in` includes a version newer than last evaluated. (Plan 30 G3.)
- **Workflow gates spec** (`docs/anvil/specs/2026-04-24-workflow-gates-spec.md`). ~300-line spec describing the full staged-and-gated pipeline: brainstorm → spec → plan → audit → execute → two-stage review → finish, with schema definitions, gate positions, and CLI references. (Plan 30 H2.)
- **Cheatsheet additions** (`docs/cheatsheet.md`). Sections for plan auditing, validation coverage, decision coverage, brainstorm-spec, parallel orchestration, session model override, and skill versioning. (Plan 30 H2.)

### Changed

- **`plan-verifier` agent** now emits structured `PlanAuditReport` JSON output (previously plain-text gap analysis only). The `anvil plan-audit` command surfaces this report. (Plan 30 B1/B3.)
- **Orchestrator dispatches `plan-verifier`** after `plan-writing` and before `subagent-executor` in the default workflow chain. (Plan 30 B4.)
- **`subagent-executor` two-stage review gate.** Spec-compliance must pass before code-quality is run; a failing spec-compliance triggers a rework loop. `SPEC_PASS` / `QUALITY_PASS` sentinels appear in executor JSON output. (Plan 30 A5.)
- **CLAUDE.md plan-table** row 30 updated from "Planned" to "Complete". Agent index refreshed with all v0.6.0 agents and skills. (Plan 30 H2/H3.)

### Schema (Zod additions to `src/core/types.ts`)

| Schema | Description |
|---|---|
| `ReviewReport` | Two-pass review output with `spec_compliance` + `code_quality` passes |
| `ReviewPass` | Single pass findings + `passed` boolean |
| `Finding` | Individual finding with `review_type`, `severity`, `confidence` |
| `PlanAuditReport` | plan-verifier structured output — gaps, scope_creep, ambiguities, overall_risk |
| `AuditItem` | Individual audit finding with id, description, severity |
| `ValidationMap` | Per-task test command mapping |
| `ValidationTask` | task_id, test_commands, file_paths, assertions |
| `Decision` | id, title, rationale, referenced_by |
| `DecisionsBlock` | Array of Decision |
| `DecisionCoverageReport` | Coverage summary — total, covered, uncovered, coverage_pct, passed |
| `ActiveModelFile` | Session model override — model, effort, set_at |
| `eval_fixtures` on `SkillFrontmatter` | Per-skill eval fixtures (input, expected_keywords, min_score) |
| `version`, `breaking_changes_in`, `replacement` on `SkillFrontmatter` | Skill versioning fields |

### Breaking Changes

- **`code-reviewer` JSON output shape changed.** Each finding now includes `review_type: 'spec-compliance' | 'code-quality'`. Consumers that pattern-match on finding keys must add this field.
- **Severity vocabulary reconciled.** `subagent-executor` severity is now strictly `critical | important | suggestion`. Previously, some paths emitted `error | warning | info`. Update any CI scripts that match on those strings.

### Deferred

- **Phase I — Agent-teams compatibility.** Auditing `orchestrator.md` and `ultra-worker.md` for CC's experimental `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` feature, plus thin `anvil team {start, status, stop}` wrappers. Deferred because the CC agent-teams API is experimental and subject to change. Tracked as P2·medium in `docs/roadmap.md`.
- **Phase J — Channels research preview.** `anvil channel template` to scaffold MCP channel servers (Telegram, Discord, CI alerts pushing into a running session). Deferred because the Channels API (CC v2.1.80+) is still maturing. Tracked in `docs/roadmap.md`.

### Tests

- **1097 tests passing** on the `release/v0.6.0` branch (23 commits ahead of main).
- New: parallel orchestration integration test (`tests/integration/parallel-orchestration.test.ts`), two-stage review schema tests, validation coverage detection tests, decision coverage parser tests.

## [0.5.0] — 2026-04-25

### Added

- **Agent-first slash surface** (`src/core/types.ts`, `src/skills/selector.ts`, `src/commands/cli/skill.ts`). New CC-native skill frontmatter fields — `user-invocable?: boolean` (default `true`), `disable-model-invocation?: boolean` (default `false`), plus `argument-hint`, `arguments`, `allowed-tools`, `model`, `effort`. `anvil skill list` now hides `user-invocable: false` skills unless `--include-hidden` (alias `--all`); skills with `disable-model-invocation: true` are loadable but never auto-routed. The slash menu drops from ~30 universal skills to ≤15 user-facing surfaces; agents stay primary. Audit table in `docs/anvil/specs/2026-04-24-skill-surface-audit.md`. (Plan 29 Phase A.)
- **Doctor row: `slash-menu surface`.** Counts user-invocable vs hidden skills and warns when user-invocable >15. (Plan 29 A4.)
- **Agent-first philosophy** added to `CLAUDE.md` and `skills/CLAUDE.md`: agents are the user-facing primary surface, skills default to hidden unless their description starts with "User invokes directly to …". (Plan 29 A5.)
- **UI/UX sub-skill family** under `skills/universal/ui/` (Plan 29 Phase B). Four hidden skills consumed by `ui-design`/`design-system-generation`: `style-selection` (10 named families + industry→style table + anti-patterns), `color-palette-design` (role-based palette + WCAG AA + dark-mode derivation), `typography-pairings` (11 industry pairings + modular scale + Google Fonts links), `ux-reasoning-rules` (25 numbered rules + review checklist). Eval doc: `docs/anvil/references/2026-04-24-ui-ux-pro-max-eval.md`.
- **Reference-skill harvest** (Plan 29 Phase C). Eight new universal skills imported and rewritten in Anvil's voice: `code-tour`, `codebase-onboarding`, `architecture-decision-record`, `changelog-generation` (user-facing), plus `rules/context-budget`, `rules/agentic-engineering`, `rules/coding-standards` (hidden). `learning.md` gains a Pattern Recognition section. Five language overlays (TypeScript, Rust, Java, Kotlin, Python) get `## Safety Rules` + `## Anti-patterns` subsections. Provenance log: `docs/anvil/references/2026-04-24-reference-harvest.md`.
- **`subagentStatusLine` renderer** (`src/core/statusline/subagent.ts`, `src/commands/cli/statusline.ts`, `src/installer/wire-claude-code.ts`). New `anvil statusline subagent` subcommand reads CC's subagent payload from stdin and emits one JSON line per task. CC adapter writes `subagentStatusLine.command` when `models.json → statusline.show_subagent_panel: true` (default `false`, opt-in). Doctor warns on misconfiguration. (Plan 29 F1; Plan 28 carry-forward C8.)
- **Statusline bash-parity tests** (`tests/integration/statusline-bash-parity.test.ts` + 6 fixtures). Six canonical scenarios round-tripped through the bash reference (`references/statusline-command.sh`) and the TS renderer, byte-equal after ANSI normalisation. Skipped gracefully on environments without bash 4+ or jq. (Plan 29 F2; Plan 28 carry-forward C10.)
- **Full `prompt` and `agent` hook-handler types** (`src/hooks/handlers/spec-handlers.ts`, `src/hooks/dispatcher.ts`). v0.4 stub-validated; v0.5 wires both end-to-end. `prompt` invokes the resolved skill model with the hook payload as user message; `agent` dispatches the named subagent. Both honour `timeout` (default 30s) and surface errors via exit code 2 with structured `message`. (Plan 29 F3; Plan 28 carry-forward D3.)

### Changed

- **30+ utility skills marked `user-invocable: false`** (project-exploration, deep-diving, codebase-mapping, dispatching-parallel-agents, claude-md-improvement, design-system-generation, github-workflow, gitlab-workflow, performance-profiling, plan-writing, review-requesting, review-response, security-auditing, slop-removal, subagent-executor, using-git-worktrees, verification, plus all `ui/*`, `workflows/*`, `rules/*`, and language overlays). User-facing slash menu trimmed to: `learning`, `debugging`, `test-driven-development`, `git-workflow`, `mcp-builder`, `ui-design`, `code-reviewer`, `orchestrator`, `ultra-worker`, `planning`, `feature-development`, `development`, `architecture-decision-record`, `changelog-generation`. (Plan 29 A3.)
- **Plan 28 carry-forwards landed.** `docs/anvil/specs/2026-04-24-deep-upgrade-master.md` marks C8, C10, D3 as shipped in v0.5.

## [0.4.0] — 2026-04-25

### Added

- **Statusline v1** (`src/core/statusline/`, `src/commands/cli/statusline.ts`). Full Claude Code stdin JSON contract — `model`, `output_style`, `context_window`, `rate_limits.{five_hour, seven_day}`, `cost`, `agent`, `vim`, `worktree`, etc. — drives a TS renderer with three tiers (`minimal`, `default`, `maximal`). The CC adapter now wires `statusLine.command` to `<anvilHome>/bin/anvil.cjs statusline`, replacing the bash-script approach. The bash reference remains opt-in via `anvil statusline install --shell-script`. Active routed skill is persisted to `.anvil/active-skill.json` on `UserPromptSubmit` and cleared on `Stop`/`SessionEnd`. Doctor row inspects `.claude/settings.json → statusLine.command` and warns when missing or unrecognised. (Plan 28 Phase C.)
- **Hook taxonomy expansion** (`src/core/types.ts`, `src/core/manifest-schema/claude-code.ts`). 14 new lifecycle kinds — `user-prompt-expansion`, `permission-denied`, `file-changed`, `instructions-loaded`, `config-change`, `cwd-changed`, `worktree-create`, `worktree-remove`, `post-compact`, `task-created`, `task-completed`, `elicitation`, `elicitation-result`, `stop-failure` — with matching CC `HookEvent` names and `HOOK_KIND_TO_EVENT` entries. Stub-wired in v0.4; full handler semantics arrive in v0.5. (Plan 28 Phase D1.)
- **Permission-rule `if` filtering** (`src/hooks/match.ts`). Hook config can carry an `if: string | string[]` accepting CC's permission-rule syntax — `Bash(git *)`, `Read(/src/**)`, `Skill(*)`, `Agent(<name>)`, `mcp__server__*`. Each rule parses to a predicate over the payload; `if` rules OR together. Dispatcher evaluates `matcher` and `if` before invoking and emits trace entries with `skipped: true` and `skipReason: 'matcher' | 'if'` so doctor and `anvil hooks list` can surface why a hook didn't fire. (Plan 28 Phase D2 + D4.)
- **Non-`command` handler types** (`src/core/manifest-schema/claude-code.ts`). `HookHandlerSpec` is now a discriminated union over `command`, `http` (url, method, headers, timeout), `prompt` (LLM evaluator, stub-validated for v0.4), and `agent` (inline subagent invocation, stub-validated for v0.4). v0.4 ships `command` + `http`; the stub paths parse cleanly and the dispatcher returns "not implemented" gracefully. (Plan 28 Phase D3.)
- **`anvil hooks list [--kind <kind>] [--json]`** (`src/commands/cli/hooks.ts`). Inventory of registered hooks with NAME · KIND · ENABLED · PRIORITY columns; `--kind` filters with Zod enum validation (invalid kind exits 1 and prints valid set); `--json` emits structured output. (Plan 28 Phase D6.)
- **Slash-level `--model` override** (`src/commands/slash/{plan,review,debug,tdd,ultra,agents,explore,quick,research}.md`). Every prompt-routing slash advertises `--model` in `argument-hint` and instructs the runtime to forward it as the global flag, hitting the resolver's ENV layer. (Plan 28 Phase E1.)
- **Global `--model <id>` / `--effort <level>` flags** (`src/index.ts`). Top-level Commander options set `ANVIL_MODEL` / `ANVIL_EFFORT` in a preAction hook so the existing 5-layer resolver picks them up via the ENV layer — no resolver signature change. `--effort` is validated against the `EffortLevel` Zod enum; invalid values exit 1. (Plan 28 Phase E2.)
- **Global `--output text|json` flag** (`src/index.ts`, `src/commands/cli/common/json-mode.ts`). Default `text`. The shared `maybeEmitJson` helper now respects either `ANVIL_OUTPUT_FORMAT=json` or per-command `--json`, so every command that calls it inherits the global flag. `agents` and `skill select` gain a JSON path. `docs/cheatsheet.md` documents the contract. Invalid values exit 1. (Plan 28 Phase E3.)
- **`--headless` / `--no-tui` on `anvil init`** (`src/commands/cli/init.ts`). CI-friendly form of `--yes` that skips the TUI even when stdin is a TTY. (Plan 28 Phase E4.)
- **`argument-hint` audit + normalisation** across `src/commands/slash/*.md`. Some slashes used `argument_hint` (underscore) by mistake; normalised to the documented hyphen form, and added `argument-hint` to `anvil-init`, `pr`, `select-skill`, `skill-search`, `skill-eval`. (Plan 28 Phase E5.)
- **`.claude/settings.json` generation** (`src/installer/wire-claude-code.ts`, `src/core/manifest-schema/settings.ts`). `anvil init` now writes a richer `settings.json` with `permissions.defaultMode` derived from the chosen preset (`speed-first → acceptEdits`, others → `default`), `effortLevel` from `models.json → defaults.effort`, `hooks` (already present), `statusLine` (already present), `disableAllHooks: false`, and `_anvilNotes` hints for opt-in `sandbox` and `outputStyle`. Idempotent: rerunning preserves user-set keys but always refreshes `defaultMode` from the latest preset. (Plan 28 Phase G1.)
- **`anvil settings show`** (`src/commands/cli/settings.ts`). Prints the merged effective project + user `.claude/settings.json` as JSON. Useful for "why isn't this rule applying?" (Plan 28 Phase G2.)
- **`anvil settings validate`** (`src/commands/cli/settings.ts`). Lint-only validation against the documented schema (`src/core/manifest-schema/settings.ts`). Exits 0 on pass; prints Zod issues and exits 1 on fail. (Plan 28 Phase G3.)
- **Subagent frontmatter enrichment** (`src/core/types.ts`). Eight optional fields on `AgentFrontmatter` — `disallowedTools` (deny list applied before allow list), `skills` (full content injection), `memory` (`user|project|local`), `mcpServers` (string refs or inline `{name, command, args}`), `hooks` (loose for v0.4; full schema in v0.5), `background`, `isolation: 'worktree'`, `initialPrompt`. Defaults preserve existing behaviour; the CC adapter emits the new fields verbatim and the OC adapter prepends an `<!-- anvil-note: isolation: worktree unavailable on OpenCode -->` comment when the gap matters. Existing agents updated: `code-reviewer.md` declares `disallowedTools: [Edit, Write]`, `code-explorer.md` declares `background: true`, `orchestrator.md` declares `isolation: 'worktree'`. The `using-git-worktrees` skill calls out `isolation: worktree` as the preferred mechanism for CC subagents. (Plan 28 Phase H.)
- **Doctor rows.** `CC statusline wiring (.claude/settings.json → statusLine)` (Phase C9), `CC settings template (.claude/settings.json)` (Phase G4), and `agent runtime preconditions` (Phase H4) join the existing doctor checklist. The agent-precondition row warns when an agent declares `isolation: 'worktree'` outside a git repo or `memory: 'project'` without a writable `.claude/agent-memory/` dir.
- **OpenCode parity baseline** (`src/core/manifest-schema/opencode.ts`, `src/adapters/opencode/generate.ts`). New `OpencodeHookEvent` enum + `HOOK_KIND_TO_OC_EVENT` map (`session-start → config`, `user-prompt-submit → chat.messages.transform`) + `UNMAPPED_OC_HOOKS` set + `resolveOcHook` helper. The OC adapter now emits an `anvil.hooks.{mapped, unmapped}` block in `package.json` so doctor can verify wiring matches the live registry. (Plan 28 Phase B1–B6.)
- **`anvil init --diff`** (`src/installer/diff.ts`). LCS-based unified diff of what would change without writing — summary `{new, changed, deleted, unchanged}` plus per-path previews. Pairs with `--dry-run` for full plan-mode visibility. (Plan 28 Phase A1.)
- **`--dry-run` + `--json` on `anvil uninstall`** (`src/commands/cli/uninstall.ts`) and **`anvil upgrade`** (`src/commands/cli/upgrade.ts`). Match the existing `init` plan-mode surface so any destructive operation has a dry-run path. (Plan 28 Phase A3 + A4.)
- **Router thresholds overridable via `models.json`** (`src/intent/router.ts`). New `RouterThresholds` Zod schema in `src/core/types.ts` with optional `ask_tie_tolerance`, `multi_intent_threshold`, `confidence_floor`, `directive_threshold`. `resolveRouterThresholds(config)` merges with `DEFAULT_ROUTER_THRESHOLDS`; `pickTopIntent`, `isDirective`, and `route` accept an optional `thresholds` parameter. The `user-prompt-submit` hook now threads the resolved thresholds through the hot path. (Plan 28 Phase A6.)
- **Cross-platform parity test** (`tests/integration/cross-platform-parity.test.ts`). Asserts hook-taxonomy parity between CC and OC adapters and lints agent bodies for CC-only language so OpenCode users don't see broken references. (Plan 28 Phase B7.)

### Changed

- **`EffortLevel` enum migrated to the CC spec** (`src/core/types.ts`). Was `low | normal | high | max`; now `low | medium | high | xhigh | max`. The `medium` value replaces the legacy `normal`; `xhigh` is the new tier between `high` and `max`. Affects every `models.json`, `effortLevel` in `.claude/settings.json`, and the CC `effortLevel` setting. **Breaking** — re-run `anvil init` to regenerate `~/.anvil/models.json`. (Plan 28 Phase A0.)
- **Statusline default wiring** points `statusLine.command` at the TS renderer (`anvil statusline`) instead of copying a bash script into `.claude/`. The bash reference is still available via `anvil statusline install --shell-script` for users who prefer an external file.
- **TUI counts are dynamic.** The welcome screen reads counts from the live skill / hook / agent registries instead of hardcoding "20 universal skills / 7 lifecycle hooks / 5 orchestrator agents". (Plan 28 Phase A3.)
- **Doctor checks expanded** (`src/commands/cli/doctor.ts`). New rows: skill name uniqueness, models.json skill references, hook exit-code contract, statusline wiring, settings template, agent runtime preconditions.
- **Hook registry / dispatcher** carries optional `matcher` and `ifRules` fields per `RegisteredHook`; the plugin manifest emission propagates them so CC's own dispatcher filters before invoking — saves a process spawn for every irrelevant tool. (Plan 28 Phase D5.)
- **`bundled-hooks-run` test isolates HOME** so the hook reads the fixture's `models.json` instead of whatever happens to live in the user's installed `~/.anvil/`. (Bookkeeping — Plan 28 Phase D.)

### Fixed

- **Lint and format errors swept** across `src/installer/wire-claude-code.ts`, `src/hooks/match.ts`, `src/hooks/dispatcher.ts`, `src/tui/screens/hooks.ts`, `tests/unit/hooks/match.test.ts`, and `src/commands/cli/doctor.ts` so Biome runs clean.
- **`v1.schema.json` regenerated** to reflect the broader `HookEvent` enum and the new `HookHandlerSpec` discriminated union.
- **Hook-kind parity test** updated to recognise the expanded Layer-A set after Phase D1 grew the CC taxonomy from 9 to 23 events.

### Deferred (to v0.5)

- C8 — `subagentStatusLine` (per-subagent statusline rendering).
- C10 — round-trip parity tests against the bash reference.
- D3 — full `prompt` and `agent` handler-type semantics (stub-validated only in v0.4).
- Plan 28 Phase F — automated CHANGELOG generation, doc cross-linking, plan-level test inventory script.

## [0.3.0] — 2026-04-24

### Added

- **Directive-strength routing at confidence ≥ 0.75** (`src/intent/router.ts`, `src/core/routing-banner.ts`). The routing banner now escalates from a one-line advisory to a multi-line `▶ DIRECTIVE` block when the router is confident (≥ 75%) and the chosen agent is a specialist (not `main`). The directive lists the named agent, skill bundle, and applicable rules, plus a note telling the assistant to delegate first and handle inline only as an explicit override. Paired with a new `orchestrator-first` meta-rule (`skills/universal/rules/orchestrator-first.md`) that codifies the "delegate first" expectation and defines the trivial-task carve-outs. Suppress either banner variant with `ANVIL_ROUTING_BANNER=off`.
- **Router eval harness** (`tests/unit/intent/router-eval.test.ts` + `tests/fixtures/intent-prompts.json`). 58 labeled prompt fixtures covering all 12 intents (≥ 4 per intent) plus negative-pattern veto rows. The harness computes precision/recall/F1 per intent and an overall accuracy, printing a confusion table on every run and asserting a 0.75 accuracy floor. Current baseline: **0.96 overall accuracy**, 9 intents at perfect F1.
- **ProjectContext-aware detection** (`src/intent/context-signals.ts`). The router's `route` now accepts a `ProjectContext` and boosts or suppresses intents based on what the repo actually is: test runner installed + a `*.test.*`/`*.spec.*` file in the prompt → test +2, debug +1; UI framework (React/Vue/Svelte/Next) + UI word → explore/refactor +1; TypeScript top-language + type words → refactor/debug +1; release CI + release words → plan/review +1. Prompt-only path unchanged when no context is supplied (the hot hook path stays ctx-free to avoid disk I/O on every keystroke).
- **Multi-intent routing (`mode: 'parallel'` with `secondaryIntents`).** When the runner-up intent's score is ≥ 60% of the top's, the router attaches it as a `SecondaryIntent` on the `RoutingDecision` and switches `mode` from `single` to `parallel`. The single-line banner appends `+N more`; the directive block gets a `secondary:` line. The agent runner preamble emits a `secondary=` row so downstream consumers can act on it. Dispatch of the secondary is metadata-only in this release — the orchestrator will consume it in a follow-up.
- **`fallback: 'ask'`** when the top two scores are within 5% of each other. Previously wired in the schema but never produced; now the router emits a distinct `▶ ambiguous · ask · candidates: X, Y · use /skill to pick` banner when it cannot distinguish two intents, deferring the choice to the user rather than guessing. Decision order is now: main (no signal) → generic (below floor) → ask (tie) → multi-intent → single.
- **`execution` / `safety` / `workflow` rule buckets** on `RoutingDecision.rules` are now populated (previously always empty). `IntentDefinition` gains `executionRules`, `safetyRules`, `workflowRules` fields; `verification-before-completion` moved to execution, `tdd-iron-law` to workflow, evidence-based rules stay in prompt. The agent runner preamble renders all four buckets so subagents see rule categorization, not just a flat list.
- **Negative patterns on `IntentDefinition`.** Optional `negativePatterns` field whose matches subtract weight from the intent's score; a net ≤ 0 vetoes the intent entirely. Currently wired for `debug` (`not a bug`, `working as intended`), `test` (`not a test`, `skip tests`, `without tests`), and `refactor` (`don't refactor`, `no refactor`).
- **Keyword expansion across all 12 intents** tuned against the eval harness. Examples: `flaky`, `intermittent`, `bug in`, `not working`, `doesn't work` (debug); `write tests for`, `broken test`, `regression test` (test); `where is`, `how does`, `tour of` (explore); `consolidate`, `extract`, `rename`, `reorganize` (refactor); `end to end`, `take care of`, `all the way` (autonomous); `roadmap`, `milestones`, `subtasks` (plan); `options for`, `alternatives to` (research); `tool server`, `sse endpoint` (mcp); `uninstall`, `doctor` (install).
- **`intent-skills-exist` integration test** (`tests/integration/intent-skills-exist.test.ts`). Asserts that every skill name referenced in `INTENT_DEFINITIONS[].defaultSkills` resolves to a loaded skill. This test caught real drift on first run: `silent-failure-hunter` and `code-simplifier` were listed as skills but live as agents.

### Changed

- **`RoutingDecision` schema** gains `secondaryIntents: SecondaryIntent[]` (default `[]`) and `candidates: string[]` (default `[]`) fields. Existing consumers that construct `RoutingDecision` via `.parse` inherit the defaults; direct-literal consumers were updated to include the new fields.
- **`buildRoutingDecision` now sets `mode: 'parallel'`** when a `secondary` is present. Previously always emitted `mode: 'single'`.
- **Cleaned intent definitions.** `debug.defaultSkills` reduced to `['debugging']` (removed `silent-failure-hunter` — it's an agent); `refactor.defaultSkills` reduced to `['slop-removal']` (removed `code-simplifier` — it's the `defaultAgent`).
- **Removed legacy re-exports** of `detectIntents` / `pickTopIntent` from `src/hooks/handlers/user-prompt-submit.ts`. All callers import directly from `src/intent/router.ts`.

### Deferred to a future release

- **Always-on orchestrator ("Wiring B")** — promoting Anvil from a plugin inside the Claude Code session to the top-level shell around it (Anvil CLI calls the Anthropic API directly, runs its own router → dispatcher → verification loop). Listed as P3·medium in `docs/roadmap.md`. The router primitives introduced in this release are the foundation; the shell is the missing piece.
- **Secondary-intent dispatch.** `mode: 'parallel'` is now populated by the router but the agent runner still dispatches only the primary. A follow-up release will wire the orchestrator to fan out both agents when parallel.
- **LLM-in-the-loop classifier.** Considered and rejected for this release. The eval harness now exists; revisit once fixture coverage exposes a real tail-case failure mode that keyword+context can't address.

### Plan

- **Plan 27** (`docs/anvil/plans/2026-04-24-27-v0.3.0-router-directive.md`) — v0.3.0 scope, rationale, and verification log.

## [0.2.6] — 2026-04-24

### Fixed

- **`UserPromptSubmit` hook surfaced "No stderr output" on every prompt.** The handler at `src/hooks/handlers/user-prompt-submit.ts:35` assumed `ctx.payload` was the raw prompt string and read it directly as `const prompt = ctx.payload`. In practice, `src/hooks/entrypoint.ts:37` passes the full parsed JSON object (`{ prompt, session_id, cwd, hook_event_name, … }`), so `prompt` was always `undefined`. The handler returned `{ exitCode: 1, message: 'empty prompt detected' }` and the entrypoint wrote that message to stdout (line 64), producing Claude Code's "No stderr output" / "non-blocking status code" banner on literally every user keystroke. The fix is a one-line extractor change from `ctx.payload` to `ctx.payload.prompt` (the field was always present on the object — just one level deeper). Five regression tests were added in `tests/hooks/user-prompt-submit.test.ts` covering: string payload (legacy shape, forward-compat), object payload with populated `prompt` field, object payload missing `prompt` key entirely, object payload with a whitespace-only `prompt`, and an empty object `{}`. All five must pass before the PR merges.

### Added

- **`ANVIL_TASK_BANNER` — visible banner on every Task-subagent dispatch.** A new sub-handler `src/hooks/handlers/task-banner.ts` plugs into the existing `preToolUseHandler` multiplexer. Whenever the `PreToolUse` hook fires with `tool_name === 'Task'`, the handler emits `▶ <subagent_type> — <description>` to stdout (extracted from the Task input's `description` field). The banner is enabled by default; set `ANVIL_TASK_BANNER=off` (or `0` or `false`) to suppress it. This mechanism is deterministic and hook-level — it fires even when the orchestrator model forgets to emit its own announcement or when the skill is misconfigured. It complements (does not replace) the skill-level mandatory "▶ Wave N — dispatching M agents…" announcement rule introduced in the same release.

### Changed

- **Orchestrator skill / agent — delegation is now the default, with a mandatory visible header.** In a live session, the orchestrator executed approximately nine subtasks inline without dispatching a single subagent, because three independent escape hatches in the skill and agent files made inline execution the path of least resistance. Specifically: `skills/universal/orchestrator.md` contained a "When NOT to Orchestrate" clause that treated any sequential dependency as a valid reason to skip fan-out entirely; `skills/universal/orchestrator-guide.md` used "implement feature + write tests" as a canonical anti-fan-out example, which generalises to nearly every real engineering task; and `agents/orchestrator.md` instructed the agent to execute directly when the dependency graph was linear. All three escape hatches have been removed and replaced with explicit "orchestration is the default for ≥ 3 subtasks" language. A mandatory "Visible Dispatch Announcement" section was inserted in each file, requiring the model to emit `▶ Wave N — dispatching M agents…` before every delegation so the user can see every fan-out happening in real time.

- **Plan 26** (`docs/anvil/plans/2026-04-24-26-v0.2.6-orchestrator-fixes.md`) — v0.2.6 scope, rationale, and verification log.

## [0.2.5] — 2026-04-24

### Fixed

- **`--statusline` now actually installs the status line.** `anvil init --statusline` was accepted by the CLI and flowed into the Claude Code adapter, but `src/installer/stage.ts` explicitly dropped the generated `.claude/statusline.sh` and `.claude/settings.local.json` on the grounds that they weren't part of the `~/.anvil` canonical layout — and no wiring step restored them. The flag was a silent no-op with no error and no file produced. Ownership now lives end-to-end in the installer: `stageAnvilHome` copies `templates/statusline.sh` into `~/.anvil/templates/statusline.sh`, and `wireClaudeCodeProject` accepts a `statusline` flag that writes `.claude/statusline.sh` (chmod +x) and merges the `statusLine` block into `.claude/settings.json` (single source of truth — `settings.local.json` is no longer used). The statusline branch was removed from the Claude Code adapter and `statusline` dropped from `AdapterContext`. Five regression tests added in `tests/installer/wire-claude-code.test.ts` cover the happy path, idempotency, the user-scope-plugin coexistence branch, the opt-out default, and a helpful error when the template is missing.
- **TUI installer now uses the canonical `syncAnvilHome` + `applyTargets` pipeline.** The TUI path was routing through the legacy `runInstaller` (direct adapter writes into `cwd`/`home`), while `anvil init --yes` went through the v2 stage-and-wire pipeline. The two produced different on-disk layouts from the same inputs. Both paths now share a single code path — only the input source (prompt vs. flag) differs.

### Added

- **`anvil init --cli` and `./install.sh --yes --cli`.** The CLI symlink creation (`~/.local/bin/anvil → ~/.anvil/bin/anvil.cjs`) was previously reachable only from the low-level install driver (`./install.sh --claude-code-user --cli`), so users on the friendly TUI / `init --yes` path had a working plugin but no `anvil` on PATH. The logic is extracted into `src/installer/link-cli.ts` and wired into both `init` flows; `install.sh` moves `--cli` into the `INIT_FLAGS` set so it no longer forces driver-mode routing. Regression tests in `tests/installer/link-cli.test.ts`.
- **TUI screens for CLI symlink + status line.** `src/tui/screens/cli.ts` and `src/tui/screens/statusline.ts` appear between the model preset and the install preview. When the corresponding flag is passed via `anvil init --cli` / `--statusline`, the respective screen is skipped (flag acts as a pre-seed). CLI defaults to yes, statusline to no.
- **Plan 25** (`docs/anvil/plans/2026-04-24-25-v0.2.5-install-fixes.md`) — v0.2.5 scope, rationale, and verification log.

## [0.2.4] — 2026-04-24

### Fixed

- **`./install.sh` no longer fails with `unknown command: init`.** The interactive path was calling `node bin/install-driver.cjs init`, but that driver only implements `install` / `uninstall` / `purge`. A fresh-install attempt with no flags exited immediately. `install.sh` now routes user-friendly flags (`--yes`, `--preset`, `--target`, `--scope`, `--claude`, `--opencode`, `--statusline`, `--dry-run`, `--diff`, `--json`) and the no-flag interactive mode through the main `anvil` CLI (`bin/anvil` under Bun, `bin/anvil.cjs` under Node), while target-scoped flags (`--claude-code-user`, `--opencode-project`, `--all`, `--none`, `--from-*`, `--prefix`, `--cli`, `--force`, `--verbose`) still go to the install driver.
- **Anvil hooks no longer fire twice per event when installed at both user and project scope.** `wireClaudeCodeProject` merged `${CLAUDE_PLUGIN_ROOT}`-substituted hook commands into `.claude/settings.json`, and the user-scope plugin *also* auto-registered the same hooks via Claude Code's plugin system — every `UserPromptSubmit` / `SessionStart` / `PreToolUse` hook therefore fired once per registration. Project wire now detects an existing user-scope registration (both the v1 flat and v2 nested `installed_plugins.json` formats) and skips the settings.json merge, purging any stale `_anvilOwned` entries from prior installs. Tests added in `tests/installer/wire-claude-code.test.ts`.

### Added

- **`--help` / `-h` flag on `install.sh`, `uninstall.sh`, and the new `upgrade.sh`.** Every script prints a scoped usage block (flag glossary + representative examples) and exits `0` without touching the filesystem. The help path runs before node/bun detection so it works on bare machines, and unknown flags on `uninstall.sh` / `upgrade.sh` now point users at `--help`.
- **`upgrade.sh`** — thin Bash wrapper that rebuilds `dist/` when the source tree is newer and then execs `anvil upgrade`. Matches the install/uninstall surface so the three lifecycle scripts behave uniformly.

## [0.2.3] — 2026-04-24

### Fixed

- **`~/.anvil/commands/` is now populated on install.** `src/installer/stage.ts` was dropping the Claude Code adapter's `commands/` output on the mistaken assumption that the OpenCode generator emits canonical copies; OpenCode does not emit slash commands at all. The staged layout now carries the CC-emitted `commands/<name>.md` files, which the existing `plugins/claude-code/commands` symlink already exposes to Claude Code. Regression test added in `tests/installer/stage.test.ts`. Closes the v0.2.2 known gap.
- **`anvil doctor` CLI ↔ slash parity check now reflects installed state.** When `~/.anvil/commands/` is missing and the check falls back to the repo's `src/commands/slash/` dev path, it emits a **warn** (suffix: `re-run \`anvil init\``) instead of a pass — so fully-installed environments see a real validation and dev checkouts see a clear next step.

### Changed

- **Docs tree reorganized.** legacy docs consolidated under `docs/anvil/`; `docs/plans/` and `docs/research/` folded into `docs/anvil/` (`anvil-v0.2.0-brief.md`, `master-implementation-plan.md`, `v0.3.0-candidates.md`, `unified-analysis.md` now live there). All cross-references updated across `CLAUDE.md`, `AGENTS.md`, `README.md`, `CHANGELOG.md`, `docs/roadmap.md`, `docs/architecture-v2.md`, numbered plans, skills that write plans (`plan-writing`, `default-feature` workflow), and the `pr-branch` CLI / slash / hook / tests. `git mv` preserves history.
- **Superseded top-level docs removed.** `docs/architecture.md` (superseded by `docs/architecture-v2.md`) and `docs/quick-start.md` (duplicated `docs/getting-started.md`) deleted.
- **User-facing docs refreshed.** `docs/installation.md` and `docs/getting-started.md` now document the interactive installer/uninstaller TUI that shipped in v0.2.1, Bun-first runtime preference, the structured summary output, and the `~/.anvil/bin/anvil.cjs` invocation pattern (prior text pointed to the wrong binary). Getting-started also calls out `anvil route` for prompt-routing dry runs.

### Added

- **`CONTRIBUTING.md`** at the repo root — dev setup, layered architecture reference, conventions, and the landing-a-change checklist.
- **Plan 24** (`docs/anvil/plans/2026-04-24-24-v0.2.3-docs-reorg.md`) — v0.2.3 scope, rationale, and verification log.

## [0.2.2] — 2026-04-24

### Fixed

- **Routing decision visible in live Claude Code / OpenCode sessions.** `renderRoutingBanner` is now emitted from the `UserPromptSubmit` hook pipeline via `HookResult.message`; previously the decision was attached to `ctx.context` but never rendered, so users only saw the banner via the `anvil route` dry-run CLI. Gated by `ANVIL_ROUTING_BANNER` (default on; set to `off`/`0`/`false` to suppress).
- **"Explain how X works" prompts route to `explore` instead of `autonomous`.** Added `explain` (weight 3) and `how` (weight 1) keywords to the `explore` intent in `src/intent/intents.ts`. Before: the prompt matched no intent patterns and fell through to the `autonomous` fallback agent (`ultra-worker`). After: intent=`explore` with score 4, routing to `code-explorer` + `codebase-mapping`/`project-exploration`.

### Added

- **`anvil doctor` CLI ↔ slash parity check** — promotes the build-time enforcement from `tests/integration/cli-parity.test.ts` to a runtime check that fires on every `anvil doctor` invocation. A new shared helper `src/commands/cli/common/cli-parity.ts` exposes `auditCliSlashParity`; both the integration test and the doctor check consume it (single source of truth). Closes the P0 roadmap item "Doctor: assert all 21 slash commands resolve to a CLI counterpart".
- **`type-design-analyzer` review agent** (`agents/type-design-analyzer.md`) — flags type/data-shape design smells in PRs: unnecessary optionality, over-wide unions, `any`/`unknown` escape hatches, coupled shape-and-behaviour, missing brand types, under-constrained generics, boolean params, stringly-typed enums. Completes the roadmap P2 item "Specialised PR-review agents" (half shipped previously as `silent-failure-hunter`).
- **Orchestrator skill — async-turn discipline documentation.** `skills/universal/orchestrator.md` gains a concise "Yielding While Agents Run" section; `skills/universal/orchestrator-guide.md` gains a full `## 4. Async-Turn Discipline` section covering five concrete gotchas grounded in the v0.2.1 sprint: yielding behaviour, partial completion handling, heterogeneous result composition, cascade failure retry budget (cap 2 per wave), and notification-timing expectations (30s–8min typical round trip).

### Changed

- **`anvil progress` now shows real session cost telemetry.** `session-end.ts` now persists its payload to `.anvil/session.json` (`{ tokensUsed, estimatedCostUsd, durationMs, sessionStart }`) via `ctx.cwd`; `progress.ts` already read from that path but the file was never being written. Cost section switched to the shared `printKv` helper for visual consistency with `doctor`/`init`.
- **`renderRoutingBanner` relocated** from `src/tui/components/` (Layer 6) to `src/core/` (Layer 0) to respect the layer import rules — `hooks/` (Layer 2) couldn't legally import from `tui/`. The function is a pure text formatter with no TUI machinery beyond `chalk`. Three importers (hooks handler, cli/route.ts, test) updated; the test file followed the move to `tests/unit/core/`.

### Known gaps

- **Installed-path resolution for the CLI↔slash parity check** falls back to a repo-relative path when `~/.anvil/commands/` does not exist (the CC adapter generates slash files but `stage.ts` drops them before install). In the dev repo this resolves correctly to `src/commands/slash/`; in a fully-installed environment without the fallback path the check downgrades to a warn rather than failing. Plan 24 will fix the installer to stage the commands directory.

## [0.2.1] — 2026-04-24

### Fixed

- **`anvil doctor` no longer reports a false "CC user not wired" warning.** The check was reading `~/.claude/plugins/installed_plugins.json` as a flat `{ "anvil@anvil": … }` map; Claude Code's actual v2 schema nests entries under `.plugins['anvil@anvil']` as an array of per-scope objects. `isCcUserWired` is now an exported pure function with 8 regression tests covering the v2 schema, flat legacy keys, missing/malformed files, and project-only wiring.

### Added

- **`anvil route <prompt>` command** (+ `/route` slash counterpart): dry-run router that prints the skill/agent Anvil would select for a given prompt, plus top intents with scores and matched keywords. `--json` emits a machine-readable `RoutingDecision`. Covered by unit + integration tests (7 fixture prompts exercising the detect→select pipeline).
- **Shared CLI reporting helpers** at `src/commands/cli/common/report.ts`: `badge`, `printKv`, `printCheckList` (tally + exit-code legend), `printInstallSummary` (per-category file counts, target status, next-step hint), `printRemovalSummary` (grouped-by-dir removal list). Consumed by `doctor`, `init`, `upgrade`, and the TUI success screen.
- **Interactive `install.sh` / `uninstall.sh`**: running either script with no flags now launches the full `@clack/prompts` TUI (`anvil init` / new `runUninstallTui`) instead of the silent non-interactive path. Flag-through behaviour preserved for scripted runs. Both scripts print a bold `▶ Anvil installer/uninstaller` banner and the build step's stdout is no longer silenced.
- **Uninstall TUI** (`src/tui/screens/uninstall.ts`): detects which targets are actually present, pre-selects them in a `multiselect`, confirms path count, streams a spinner, and prints a grouped removal summary. Cancels cleanly at every prompt.
- **`runUninstallPlan`** (pure): the path-computation logic was factored out of `runUninstall` so the TUI can preview what will be removed without touching the filesystem.

### Changed

- **`anvil doctor` output** now renders as a check list with a trailing `"N passed, M warnings, K failed"` tally and an exit-code legend. The `table` npm dependency is no longer imported there.
- **`anvil init`** surface: after `runInstaller` returns, a rich summary is printed (category counts: skills/agents/hooks/commands/bin/plugins; per-target status with detail lines; next-step hint) instead of the previous single-line `✓ anvil initialized…`. `--json` mode unchanged.
- **`anvil upgrade`** now shows `old → new` versions and the same rich summary as `init`.
- **TUI installer** (`src/tui/installer.ts`): the `outro` line is now preceded by `printInstallSummary`, so the TUI and the flag-driven paths produce the same post-install output.
- **`src/installer/stage.ts`**: the `console.warn('[stage] Unrecognised CC generator output…')` and symlink drop warnings are now gated behind `ANVIL_VERBOSE` so normal installs are clean.
- **`src/installer/sync.ts`**: `SyncResult` gained a `filesWritten: string[]` field (relative paths from stage) so consumers can categorise the install output without re-scanning disk.
- **`marketplace.json` version** (was drifting behind `package.json`) is now bumped in lockstep.

### Known gaps

- `renderRoutingBanner` is invoked only by the new `anvil route` CLI. It is **not** yet emitted from the live `UserPromptSubmit` hook pipeline — the hook attaches a `routingDecision` to `ctx.context` but no UI surface prints the banner during a real Claude Code / OpenCode session. See plan `2026-04-24-22-v0.2.1-enhancements.md` for the follow-up scope.

## [0.2.0] — 2026-04-24

### Fixed

- **`install.sh` no longer runs a second TUI on top of its own flag prompts.** Previously `install.sh` collected `--target/--scope/--preset` and then handed off to `anvil init`, which opened a full `@clack/prompts` TUI and re-asked for the same information. A user who changed `scope` or `target` inside the TUI would produce files somewhere the shell wrapper didn't expect, and the post-install assertion would then fail with a confusing "TUI cancelled?" message. `install.sh` now defaults to `--yes` (passes the bash-side flags straight through); the full TUI is opt-in via the new `--tui` flag or by running `anvil init` directly.
- **PATH guidance after install**: dropped the `bun link` suggestion (bun's `link` only adds a `node_modules` entry — it does **not** put a binary on `$PATH`). The installer now recommends a direct symlink into `$HOME/.local/bin` with `npm link` as an alternative.
- **TUI outro prints the actual install root + file count** so the user can see exactly where files landed (previously it only said "Anvil ready").
- **Skill discovery (Claude Code)**: skills are now emitted as `skills/<name>/SKILL.md` (per-skill subdirectory with the literal uppercase filename) instead of the flat `skills/<name>.md` layout. Per Claude Code's [plugin contract](https://code.claude.com/docs/en/plugins-reference), flat-file skills are silently ignored — this is why a freshly installed Anvil plugin appeared to have zero skills regardless of how many were bundled.
- **`anvil doctor` checks the actual install evidence**: replaced the legacy `.anvil/` directory checks with `.claude-plugin/plugin.json` plus per-directory counts (skills/agents/hooks/commands). The "skills loaded: N" line is now labelled `skills bundled (source repo)` so it's clear it counts what's available to install, not what Claude Code can see.
- **`install.sh` no longer reports success when the TUI is cancelled**: the script checks that `init` produced the expected manifest file and exits with a clear error otherwise. If `anvil` is not on `$PATH` after install, it prints `bun link` / symlink instructions instead of leaving the user to discover the missing binary.
- **`bunfig.toml`**: dropped the malformed `[test]` table that broke `bun test` invocations.
- **Installation end-to-end (Plan 17)**: Claude Code plugin manifest (`.claude-plugin/plugin.json`) now emits the event-keyed `hooks` structure required by Claude Code's plugin loader. Previously Anvil wrote a custom `{kind, script, enabled}[]` shape that Claude silently ignored, so none of the advertised skills/hooks/commands were actually discovered.
- **Skill and agent paths**: skills/agents/hooks/commands are now emitted at the plugin root (`skills/`, `agents/`, `hooks/`, `commands/`) instead of under `.claude/` — matches the layout every Claude Code plugin in the wild uses.
- **OpenCode manifest** tightened to enforce `mode` and `tool_permissions` via Zod; previously drift was only caught by the adapter test.

### Added

- **Plan 20 UI/UX expansion**: 4 new sub-skills (`style-selection`, `color-palette-design`, `typography-pairings`, `ux-reasoning-rules`) under `skills/universal/ui/`, plus recursive skill discovery and skill-eval fixtures. See `docs/anvil/references/2026-04-19-ui-ux-summary.md`.
- **Plan 19 reference sweep**: 8 ADOPT items shipped (2 skills, 2 hooks/extensions, 2 commands, 1 core schema extension); 23 DEFER + 26 SKIP catalogued. See `docs/anvil/references/2026-04-19-summary.md`.
- **Plan 18 audit sweep**: 6 area audits (core / skills / hooks / agents / commands / adapters) confirm Plans 1–17 deliverables; 0 FAIL findings, 5 accepted DRIFT documented as P2/P3 follow-up. Release-candidate gate green (build, typecheck, full test suite, smoke install).
- **`bin/anvil` Bun entry point** and Bun-first runtime migration. `bin/anvil.cjs` retained as Node fallback — auto-forwards to Bun when available.
- **`install.sh`** rewritten: detects Bun → Node ≥20 → fails loud; builds from source when global install fails; runs `anvil doctor` and exits non-zero on failure.
- **`uninstall.sh`** — standalone uninstaller that works without a functional `anvil` CLI (removes `.claude-plugin/`, `.opencode/`, plugin-root `hooks/` scripts, and optionally the global binary).
- **TUI preview step**: before any files are written, the installer prints the full list of target paths grouped by adapter and prompts for explicit confirmation.
- **Per-option hints** in the TUI for `target`, `scope`, `preset`, `statusline`, and `hookProfile` prompts.
- **`src/core/manifest-schema/`**: Zod schemas for Claude Code `plugin.json` and OpenCode manifest. Every emitter now `.parse`s its output before serialising.
- **`tests/integration/install-works.test.ts`**: end-to-end regression guard. Runs `anvil init` into a tmpdir and asserts the emitted tree against the real Claude Code schema.
- **Docs triad**: `docs/features.md`, `docs/getting-started.md`, `docs/cheatsheet.md`.
- **Claude Code status line** (`templates/statusline.sh`): Optional POSIX-compatible status line script showing model, context usage %, cost, and active agent. Enabled via `anvil init --statusline`. Writes `.claude/statusline.sh` and `.claude/settings.local.json` with statusLine config.
- **`--statusline` flag on `anvil init`**: Optional toggle to install the Claude Code status line during project setup.
- **3 protective hooks** (all advisory, disabled by default):
 - `phase-boundary`: Warns when editing planning/state artifacts outside a planning skill
 - `read-guard`: Tracks file read counts per session, warns at 50/100 reads to prevent context exhaustion
 - `workflow-guard`: Detects source file edits outside an active workflow, suggests `anvil quick`
- **Researcher agent** (`agents/researcher.md`): 3-phase deep research (scope → gather → synthesize) producing structured RESEARCH.md with options matrix, trade-offs, and recommendations.
- **Framework-selector agent** (`agents/framework-selector.md`): Evaluates 3-5 competing frameworks across 7 scored dimensions with anti-bias safeguards.
- **`anvil discuss` command + `/discuss` slash command**: Structured decision capture using the brainstorming skill.
- **7 missing CLI commands registered in `index.ts`**: verify, research, quick, progress, pause, resume, discuss.
- **Documentation**: `docs/quick-start.md` (5-minute guide), `docs/workflow-guide.md` (7-phase development lifecycle), `docs/troubleshooting.md` (8 common issues with fixes).
- **Expanded universal skills**: `learning.md` (14→63 lines, 4-phase teaching methodology), `skill-creation.md` (36→113 lines, template selection, frontmatter guidance, validation checklist).
- **17 new tests**: skill selector edge cases (tag vs trigger scoring, empty triggers, case-insensitive, substring), hook dispatcher (disabled hooks, execution order, message collection, kind filtering), model resolution (fallback chain propagation, override max_tokens, default fallback).
- **9 remaining universal skill stubs expanded** from 14-36 lines to 56-112 lines: development, dependency-management, doc-writing, security-auditing, performance-profiling, orchestrator, github-workflow, gitlab-workflow, skill-selection. All universal skills now have substantive bodies with concrete patterns, anti-patterns, and actionable processes.

### Changed

- `package.json` scripts switched to `bun run …`; `bin.anvil` now points to `./bin/anvil`.
- `bunfig.toml` added.
- Roadmap: P3 items carry explicit `(medium)` / `(low)` sub-priority tags.
- `src/core/types.ts`: `ModelDefaults` and `ModelResolution` schemas extended with `fallback_chain: z.array(z.string).default([])`.
- `src/core/models/resolve.ts`: All 5 resolution layers now propagate `fallback_chain` from defaults.
- `src/hooks/handlers/user-prompt-submit.ts`: Enriched with keyword-based intent detection (ultra, explore, review, debug, plan, research).
- **10 language skills expanded** from 14-line stubs to 65-79 line comprehensive guides: Python, Go, Rust, Java, Kotlin, Ruby, React, Next.js, Django, Laravel. Each now includes concrete patterns, 3-5 common pitfalls, testing frameworks, tool detection, and project structure conventions.

## [0.1.0-beta.3] — 2026-04-14

### Added

- **`anvil verify` command + `/verify` slash command**: Run post-implementation verification — tests, build, lint, with optional `--phase` targeting.
- **`anvil research` command + `/research` slash command**: Research a topic with configurable depth (quick/standard/deep) before implementation.
- **`anvil quick` command + `/quick` slash command**: Execute ad-hoc tasks without full planning, with optional `--validate`, `--discuss`, `--research` flags.
- **Prompt guard hook** (`prompt-guard`): Scans file writes to sensitive paths for prompt injection patterns (role override, instruction bypass, system tags, invisible unicode). Advisory only, disabled by default.
- **C# development skill** (`skills/languages/csharp/csharp-coding.md`): .NET 8+, nullable reference types, async/await, EF Core, xUnit.
- **Swift development skill** (`skills/languages/swift/swift-coding.md`): SwiftUI, async/await, protocol-oriented, SPM, Swift Testing.
- **C++ development skill** (`skills/languages/cpp/cpp-coding.md`): Modern C++20/23, RAII, smart pointers, CMake, GoogleTest/Catch2.
- **AI slop remover skill** (`skills/universal/slop-removal.md`): Identifies and removes AI-generated code patterns — narration comments, premature abstraction, excessive error handling, over-configuration. Decision table for keep/remove.
- **UI designer skill** (`skills/universal/ui-design.md`): Frontend UI/UX expert with 6-pillar audit checklist — visual hierarchy, spacing, color, typography, component consistency, accessibility. Produces UI-SPEC design contracts.
- **Model fallback chains**: `fallback_chain` array in `ModelDefaults` and `ModelResolution` for ordered model degradation (beyond single `fallback_model`). Default chain: `[sonnet, haiku]`.
- **Keyword intent detection**: `user-prompt-submit` hook now detects intent keywords (ultra, explore, review, debug, plan, research) and surfaces them in hook context for downstream routing.
- **Comment checker hook** (`comment-checker`): Detects AI-generated comment patterns (narration, filler, placeholder TODOs). Advisory only, disabled by default.
- **`anvil progress` command + `/progress` slash command**: Show current branch, recent commits, uncommitted changes, and suggested next action.
- **`anvil pause` + `anvil resume` commands**: Save/restore work state via `.anvil/handoff.json` for session continuity.
- **Enriched git-workflow skill**: Rewritten with 3 modes — Commit Architect (atomic commits, style detection), Rebase Surgeon (conflict resolution), History Archaeologist (blame, bisect, log search).
- **Doc-verifier agent** (`agents/doc-verifier.md`): Fact-checks documentation against live codebase — file paths, function signatures, code examples, version claims.
- **Codebase-mapper skill** (`skills/universal/codebase-mapping.md`): Maps unfamiliar codebase across 4 dimensions — technology stack, architecture, conventions, concerns.
- **Enriched debugging skill**: Rewritten with 4-phase systematic methodology (root cause investigation, pattern analysis, hypothesis testing, implementation), the Iron Law, 3+ fixes rule, and rationalization table.
- **Enriched TDD worker skill**: Rewritten with RED-GREEN-REFACTOR cycle, mandatory VERIFY RED/GREEN gates, rationalization table, anti-patterns, and debugging integration.
- **Enriched feature-development skill**: Rewritten with 7-phase workflow (discovery, codebase exploration, clarifying questions, architecture design, implementation, quality review, summary).
- **Verification gate skill** (`skills/universal/verification.md`): 5-step mandatory gate (IDENTIFY → RUN → READ → VERIFY → CLAIM) that prevents agents from claiming completion without fresh evidence. Includes rationalization table and structured output format.
- **Context monitor hook** (`context-monitor`): Advisory hook that tracks context window usage and injects warnings at 65% (WARNING) and 80% (CRITICAL). Disabled by default — opt in via config.
- **Brainstormer skill** (`skills/universal/brainstorming.md`): 5-phase design exploration (understand context, clarify intent, propose 2-3 approaches, refine, document spec). Prevents agents from jumping straight to implementation.
- **Plan-writer skill** (`skills/universal/plan-writing.md`): Produces detailed executable plans with exact file paths, complete code, verification commands, and acceptance criteria. Enforces no-placeholder rule.
- **Plan-verifier agent** (`agents/plan-verifier.md`): Goal-backward verification — traces requirements to tasks, identifies gaps, verifies file references. Binary PASS/FAIL verdict.
- **Subagent-executor skill** (`skills/universal/subagent-executor.md`): Executes plans via fresh subagents with two-stage review (spec compliance THEN code quality). Model selection by task complexity.
- **Review-requester skill** (`skills/universal/review-requesting.md`): Guides assembling review context, dispatching reviewer agents, and triaging feedback by severity.
- **Review-responder skill** (`skills/universal/review-response.md`): Guides handling review feedback — verify before implementing, push back when wrong, no performative agreement.
- **Silent-failure-hunter agent** (`agents/silent-failure-hunter.md`): Audits error handling — finds empty catches, generic handlers, hidden failures, inappropriate fallbacks.
- **Test-analyzer agent** (`agents/test-analyzer.md`): Reviews test quality — behavioral coverage, critical gaps with impact scores, anti-pattern detection.
- **Code-simplifier agent** (`agents/code-simplifier.md`): Reduces complexity while preserving all functionality — guard clauses, dead code removal, naming improvements.
- **Enriched agent prompts** — all 5 agents rewritten from stubs (20-50 lines) to comprehensive prompts (100-250 lines):
 - `code-reviewer`: 4-phase review process, confidence scoring (0-100, only report >=80), severity classification, CLAUDE.md compliance, false positive filters
 - `code-explorer`: 3-phase discovery (feature discovery, code flow tracing, architecture analysis), structured deliverables with file:line citations
 - `code-architect`: 3-phase design (pattern analysis, architecture design, implementation blueprint), 2-3 approach comparison with pros/cons
 - `orchestrator`: Wave-based decomposition, dispatching rules with model selection, progress tracking via TodoWrite, synthesis rules
 - `ultra-worker`: 6-phase execution loop (plan/execute/verify/self-correct/commit/next), checkpoint protocol, escalation triggers, quality standards, completion report format

## [0.1.0-beta.2] — 2026-04-14

### Added

- **Agent mode + tool permissions** (`AgentFrontmatter`): `mode: primary | subagent` and `tool_permissions` (read/write/edit/bash/web) for all 5 agents. OpenCode manifest now emits both fields per agent.
- **Two new hook events**: `post-tool-use` (telemetry/memory capture) and `post-test-run` (auto-suggest fixes for failing tests). Both disabled by default — opt in via config.
- **Skill discoverability fields** (`SkillFrontmatter`): `tags`, `aliases`, `isHidden`, `tooltip`, `license`. Selector awards +2 for exact tag match, +1 for alias substring match. `anvil skill list` honours `isHidden`; `--all` shows hidden skills. Tags are validated to be single words (use aliases for multi-word phrases).
- **Installer UX**: `anvil init --diff` shows a unified diff of what would change; `--claude=yes|no` and `--opencode=yes|no` flags for per-target control; `InstallSummary.rolledBack` surfaces files rolled back on mid-write failure.
- **`skills/universal/orchestrator-guide.md`** (21st universal skill): comprehensive guidance for orchestrating parallel agents — when to fan out, how to scope subagent prompts, how to compose outputs, when to escalate to the human, TDD loop discipline.
- **Orchestrator agent enriched**: `agents/orchestrator.md` gains a Review Cycle section (completeness check, contradiction surfacing, synthesis gate) and a Handling Failed Subagents section (single/double/systemic failure recovery).
- **Model-alias regression test** (`tests/unit/core/models/regression.test.ts`): pins `fast → claude-haiku-4-5`, `balanced → claude-sonnet-4-6`, `powerful → claude-opus-4-6`, `default → claude-sonnet-4-6`. Changing aliases now requires updating both this test and the CHANGELOG.

### Changed

- `skills/universal/orchestrator.md` trigger list cleared (superseded by `orchestrator-guide.md`).
- `src/adapters/opencode/manifest.ts`: agent `mode` typed as `'primary' | 'subagent'` (was `string`).
- `src/installer/atomic.ts`: `writeManyAtomic` accepts optional `onRollback` callback.

## [0.1.0-beta.1] — 2026-04-13

### Added

- Hybrid CLI + Claude Code/OpenCode plugin
- `anvil init` — interactive TUI installer
- `anvil doctor` — diagnostic tool
- `anvil models` subcommands: list, show, set, set-group, use, reset, validate
- `anvil skill` subcommands: list, validate, enable, disable, reload, create, run, select
- Workflow commands: plan, review, debug, tdd, ultra, explore, pr, agents
- 20 universal skills + 16 language overlays (JS/TS/React/Next.js/PHP/Laravel/Python/Django/FastAPI/Go/Rust/Java/Spring/Kotlin/Ruby/Rails)
- 7 lifecycle hooks: session-start, user-prompt-submit, pre-commit, post-edit, pre-push, on-error, on-pr-open
- 5 agents: orchestrator, ultra-worker, code-explorer, code-architect, code-reviewer
- 5-layer model resolution with 4 presets (balanced, cost-optimised, max-quality, speed-first)
- CLI ↔ slash command parity enforced by tests
