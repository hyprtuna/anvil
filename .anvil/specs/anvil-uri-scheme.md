# RFC: `anvil:` Resource URI Scheme

**Ticket:** ANV-0095
**Target version:** v0.15.6
**Status:** Draft RFC (design-only; no implementation)
**Created:** 2026-05-16
**Related:** ANV-0027 (extension manifest), ANV-0096 (`<pack>:<slug>` namespace), ANV-0037 (skill MCP metadata), ANV-0198 (OC parity research)

---

## 1. Summary / Motivation

Anvil already addresses internal resources by bare slug (`code-review`, `ultra-worker`) and by a thin `anvil:<slug>` prefix used in skill/agent invocation strings — see `skills/using-anvil/SKILL.md:40-51` and `agents/*.md`'s "Invoke via" callouts. This works while there is exactly one bundled namespace, but breaks down for three near-term needs:

1. **Disambiguating kinds.** `anvil:code-review` is *both* a skill and (today) unambiguous, but as agents grow we will hit slug collisions across kinds. The current rule (`docs/naming` in AGENTS.md — skills are activity-nouns, agents end in doer-suffixes) reduces collision risk but does not eliminate it for hooks (`session-start`), commands (`init`), or plans/tickets.
2. **Pack-namespaced resources (ANV-0096).** Once external packs land, `myteam:code-review` and the bundled `code-review` must be addressable without ambiguity. The pack syntax is `<pack>:<slug>` (not URI-shaped). We need a URI that composes cleanly with it.
3. **Cross-document references.** Plans, tickets, audits, and research notes routinely link to skills/agents/hooks. Today these links are bare slugs that grep can't safely resolve (because the slug appears in prose too). A scheme-tagged URI is a single grep target.

This RFC defines the `anvil:` URI scheme, its grammar, resolution semantics, error modes, security model, and an implementation sketch. **No implementation in this RFC** — implementation is a follow-up task gated on this design being approved.

### Non-goals

- A network-fetchable `anvil://` URI (deferred; ANV-0028 catalog quarantine territory).
- User-config-file URIs (separately scoped if requested).
- Replacing the bare-slug invocation path. The scheme is **additive** — `anvil skill run code-review` continues to work indefinitely.

---

## 2. Grammar (formal + examples)

### 2.1 ABNF

```
anvil-uri    = "anvil:" [ pack ":" ] kind "/" slug [ "/" version ] [ "#" fragment ]
pack         = 1*( lowercase / DIGIT / "-" )            ; matches ANV-0096 pack rule
kind         = "skill" / "agent" / "hook" / "command"
             / "slash" / "plan" / "ticket"
slug         = lowercase 1*( lowercase / DIGIT / "-" ) lowercase
             / lowercase                                ; mirrors src/core/worktree/types.ts:Slug
version      = "v" 1*DIGIT "." 1*DIGIT "." 1*DIGIT [ "-" 1*VCHAR ]   ; semver-ish; used for plan/ticket
fragment     = 1*VCHAR                                  ; opaque to the resolver
lowercase    = %x61-7A                                  ; a-z
```

Equivalent regex (anchored, no fragment for brevity):

```
^anvil:(?:([a-z0-9-]+):)?(skill|agent|hook|command|slash|plan|ticket)/([a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9])(?:/(v\d+\.\d+\.\d+(?:-[A-Za-z0-9.+-]+)?))?(?:#(.+))?$
```

**Note on `:` separator after pack.** ANV-0096's bare syntax is `<pack>:<slug>`. Inside an `anvil:` URI we keep that `:` semantics: `anvil:<pack>:<kind>/<slug>`. The scheme prefix `anvil:` and the pack delimiter `:` are syntactically distinguished by position (pack appears between the first `:` and the kind, and must not contain `/`).

### 2.2 Examples

| URI | Resolves to | Kind |
|---|---|---|
| `anvil:skill/code-review` | `skills/<role>/code-review/SKILL.md` (or `skills/universal/...`) | skill, bundled |
| `anvil:agent/code-architect` | `agents/code-architect.md` | agent, bundled |
| `anvil:hook/session-start` | `src/hooks/handlers/session-start.ts` (handler module) | hook, bundled |
| `anvil:command/init` | `src/commands/cli/init.ts` (and `src/commands/slash/init.md`) | CLI command, bundled |
| `anvil:slash/skill-run` | `src/commands/slash/skill-run.md` | slash command, bundled |
| `anvil:plan/v0.15.6` | `.anvil/plans/v0.15.6.plan.md` (or `docs/anvil/releases/v0.15.6.md` once released) | release plan |
| `anvil:ticket/ANV-0095` | `.anvil/tickets/ANV-0095-anvil-resource-uri-scheme.md` | ticket |
| `anvil:myteam:skill/code-review` | `<packs>/myteam/skills/.../code-review/SKILL.md` | skill, pack-qualified |
| `anvil:skill/code-review#step-3` | same as row 1, fragment opaque (consumer-defined) | skill with fragment |

### 2.3 Migration of existing `anvil:<slug>` references

Existing code uses `anvil:<slug>` with **no kind segment** (e.g., `Skill({skill: "anvil:code-review"})`, `Agent({subagent_type: "anvil:ultra-worker"})`). The resolver MUST accept this **shorthand form** as input alongside the kinded form, using the invocation context to infer the kind:

- Input via the `Skill` invocation primitive → kind is `skill`.
- Input via the `Agent` invocation primitive → kind is `agent`.
- Input from CLI argv where the subcommand implies kind (`anvil skill run anvil:code-review`) → kind from subcommand.

When invocation context is absent (e.g., a free-floating reference in a doc), the resolver returns `AmbiguousKindError` and the caller must supply context or use the full kinded form. **No silent kind inference from registry lookup** — that would re-introduce the ambiguity this scheme is meant to remove.

---

## 3. Resolution Semantics

### 3.1 Algorithm (pseudocode)

```
resolveAnvilUri(uri: string, ctx: ResolveContext): Result<ResourceRef, AnvilUriError>:
  if not uri.startsWith("anvil:"):
    return Err(NotAnvilUriError)

  parsed = parseGrammar(uri)              // returns { pack?, kind?, slug, version?, fragment? }
  if parsed is null:
    return Err(MalformedUriError(uri))

  kind = parsed.kind ?? ctx.inferredKind  // shorthand path
  if kind is null:
    return Err(AmbiguousKindError(uri))

  pack = parsed.pack ?? "anvil"           // "anvil" = bundled namespace sentinel

  fsPath = filesystemMap(kind, slug, pack, version, ctx.roots)
  if not exists(fsPath):
    return Err(NotFoundError(uri, fsPath))

  ref = { kind, slug, pack, version, fragment, fsPath, uri }
  return Ok(ref)
```

### 3.2 Filesystem mapping table

`ctx.roots` is supplied by the caller and contains:
- `projectRoot` (the repo being worked on)
- `homeRoot` (`~/.anvil/`)
- `bundledRoot` (the Anvil install prefix)
- `packsRoot` (`~/.anvil/packs/`, defined by ANV-0027)

| kind | pack | resolution path (first match wins) |
|---|---|---|
| `skill` | `anvil` | `<bundledRoot>/skills/<role>/<slug>/SKILL.md` (search roles in registry order: universal, language, role) |
| `skill` | `<pack>` | `<packsRoot>/<pack>/skills/**/<slug>/SKILL.md` |
| `agent` | `anvil` | `<bundledRoot>/agents/<slug>.md` |
| `agent` | `<pack>` | `<packsRoot>/<pack>/agents/<slug>.md` |
| `hook` | `anvil` | `<bundledRoot>/src/hooks/handlers/<slug>.ts` (or compiled `.cjs` at install) |
| `hook` | `<pack>` | reserved — ANV-0027 must define if packs ship hooks |
| `command` | `anvil` | `<bundledRoot>/src/commands/cli/<slug>.ts` |
| `slash` | `anvil` | `<bundledRoot>/src/commands/slash/<slug>.md` |
| `plan` | `anvil` | `<projectRoot>/.anvil/plans/<version>.plan.md` if exists, else `<projectRoot>/docs/anvil/releases/<version>.md` |
| `ticket` | `anvil` | `<projectRoot>/.anvil/tickets/<slug>-*.md` (slug is `ANV-NNNN`; glob to find file name with suffix) |

**Precedence for unscoped lookups (no pack supplied):** project skills > home skills > bundled > installed packs (mirrors ANV-0096 §2 resolution order). The resolver applies precedence only when the URI itself does not name a pack; an explicit `anvil:<pack>:...` URI always pins to that pack.

### 3.3 Output type

```typescript
interface ResourceRef {
  uri: string                        // the original input, canonicalised
  kind: ResourceKind                 // 'skill' | 'agent' | 'hook' | 'command' | 'slash' | 'plan' | 'ticket'
  slug: string
  pack: string                       // 'anvil' for bundled
  version?: string                   // semver string for plan kind
  fragment?: string
  fsPath: string                     // absolute path on disk
}
```

---

## 4. Error Modes

| Code | Trigger | Message template |
|---|---|---|
| `NotAnvilUriError` | string does not start with `anvil:` | `not an anvil: URI: <input>` |
| `MalformedUriError` | grammar parse fails | `malformed anvil: URI: <input> (expected anvil:[<pack>:]<kind>/<slug>[/<version>][#<fragment>])` |
| `UnknownKindError` | `kind` segment not in enum | `unknown kind '<kind>' — expected one of: skill, agent, hook, command, slash, plan, ticket` |
| `AmbiguousKindError` | shorthand form with no inference context | `cannot infer kind from '<input>' — pass full form anvil:<kind>/<slug> or supply invocation context` |
| `NotFoundError` | grammar OK, kind+slug do not resolve on disk | `anvil:<kind>/<slug> not found (looked in: <paths>)` |
| `AmbiguousPackError` | unscoped slug resolves to ≥2 packs | `'<slug>' is ambiguous — packs: [<list>]. Use anvil:<pack>:<kind>/<slug> to disambiguate.` |
| `PathTraversalError` | resolved fsPath escapes its expected root | `refused: anvil:<...> resolves outside permitted root` |
| `InvalidVersionError` | version segment present but not semver-shaped (or absent for `plan`/`ticket` when required) | `invalid version segment '<v>' for kind '<kind>'` |

All errors are `Result.Err` — **never thrown** (matches the ticket's acceptance criterion "Malformed URI returns structured error (not throw)").

---

## 5. Relationship to ANV-0096 (`<pack>:<slug>`) and ANV-0027 (manifest)

### 5.1 vs. ANV-0096 namespace shorthand

ANV-0096 defines `<pack>:<slug>` as a CLI-ergonomic shorthand: `anvil skill run myteam:code-review`. This RFC's URI is the **canonical long form**.

| Use it when | Form |
|---|---|
| Typing into a terminal, in human-facing skill metadata, in chat | `<pack>:<slug>` (ANV-0096) |
| Cross-document references, machine-to-machine, log entries, MCP, doctor messages, tickets | `anvil:<pack>:<kind>/<slug>` (this RFC) |

Conversion rules:
- `<pack>:<slug>` (ANV-0096) → with invocation kind context → equivalent to `anvil:<pack>:<kind>/<slug>`.
- `anvil:<pack>:<kind>/<slug>` → strip `anvil:` and `<kind>/` to render as `<pack>:<slug>` for UX surfaces.

The two grammars are isomorphic given a kind context. The resolver should accept both at every public entry point.

### 5.2 vs. ANV-0027 manifest

ANV-0027 defines the extension manifest (`anvil-extension.json` or similar). The manifest will list exported resources by `kind` and `slug`. This RFC adds the URI as the canonical *external reference* form for those resources — a manifest can cite `requires: ["anvil:skill/test-driven-development"]` and the resolver in this RFC is what loads it.

**Coordination point with ANV-0027:** the manifest schema MUST emit URIs in canonical form (with `kind`); the resolver MUST accept both canonical and shorthand. Manifest validation rejects shorthand (Zod refinement) to keep the on-disk format unambiguous.

---

## 6. Security Considerations

### 6.1 Path traversal

The single biggest risk. A URI like `anvil:skill/../../../etc/passwd` must never resolve to a path outside the configured roots. Mitigations:

1. **Slug regex is anchored** (`^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$`) — `..` and `/` cannot survive grammar parsing. Reuse `Slug` from `src/core/worktree/types.ts:17`.
2. **Pack regex is anchored** (`^[a-z0-9-]+$`).
3. **Post-resolution check:** after computing `fsPath`, call `path.resolve` and assert the result `startsWith` the expected root. Mirror the `is_relative_to` guard.
4. **Symlink hardening:** if a pack ships a symlink that escapes the pack root, the resolver rejects with `PathTraversalError`. Implement with `fs.realpath` then re-check `startsWith`.

### 6.2 Scheme spoofing

`anvil:` is a custom scheme. Attackers cannot register `anvil://` schemes globally, but a malicious doc could contain `anvil:skill/legit-name` that the user pastes into a prompt expecting it to point to a bundled skill, while a pack with the same slug is installed. Mitigations:

1. **Doctor row:** when a pack ships a slug that shadows a bundled slug, doctor surfaces an `Ambiguous slug` row (already in ANV-0096 design).
2. **Trust boundary on resolution:** the bundled root is always searched first when no pack is given; a pack must be explicitly named (or `default_pack` set in config) to win.
3. **No URI side-effects:** resolution is read-only. The resolver returns a `ResourceRef`; execution happens in a downstream loader that does its own validation (frontmatter Zod parse, code signing in ANV-0027 future work).

### 6.3 Fragment opacity

The fragment is opaque — the resolver does not interpret it. A consumer (e.g., a skill runner) interpreting `#step-3` MUST validate the fragment against its own grammar before use. This keeps URI parsing pure and pushes content-type-specific concerns to the consumer.

### 6.4 Long-input DoS

Cap URI length at 512 chars before grammar parse. Realistic URIs are <120 chars; 512 leaves headroom for future query strings.

---

## 7. Implementation Sketch

### 7.1 Location

`src/core/uri/` — new directory (layer 0). Justification: the resolver is pure, depends only on `core/types.ts` (Slug regex) and the filesystem map; it must be callable from every higher layer (skills/, hooks/, agents/, commands/, adapters/). Layer 0 is the only legal home.

Files:

```
src/core/uri/
  index.ts        // barrel
  grammar.ts      // parseGrammar + ABNF-derived regex (pure)
  types.ts        // Zod schemas: AnvilUri, ResourceRef, AnvilUriError, ResourceKind
  resolve.ts      // resolveAnvilUri orchestrator + path-traversal guard
  filesystem-map.ts // kind → roots → path table (pure)
  format.ts       // canonicalise(ref): string; toShorthand(ref): string
tests/unit/core/uri/
  grammar.test.ts
  resolve.test.ts
  filesystem-map.test.ts
  security.test.ts  // path-traversal cases
tests/integration/uri-resolution.test.ts
```

### 7.2 Public API (TypeScript signatures)

```typescript
// src/core/uri/types.ts
export const ResourceKind = z.enum([
  'skill', 'agent', 'hook', 'command', 'slash', 'plan', 'ticket',
])
export type ResourceKind = z.infer<typeof ResourceKind>

export const AnvilUri = z.string().regex(/^anvil:.../).brand<'AnvilUri'>()
export type AnvilUri = z.infer<typeof AnvilUri>

export interface ResourceRef {
  uri: string
  kind: ResourceKind
  slug: string
  pack: string
  version?: string
  fragment?: string
  fsPath: string
}

export type AnvilUriErrorCode =
  | 'NOT_ANVIL_URI' | 'MALFORMED' | 'UNKNOWN_KIND'
  | 'AMBIGUOUS_KIND' | 'NOT_FOUND' | 'AMBIGUOUS_PACK'
  | 'PATH_TRAVERSAL' | 'INVALID_VERSION'

export interface AnvilUriError {
  code: AnvilUriErrorCode
  message: string
  uri: string
}

// src/core/uri/resolve.ts
export interface ResolveContext {
  roots: {
    projectRoot: string
    homeRoot: string
    bundledRoot: string
    packsRoot: string
  }
  inferredKind?: ResourceKind  // for shorthand-form input
}

export function resolveAnvilUri(
  uri: string,
  ctx: ResolveContext,
): { ok: true; ref: ResourceRef } | { ok: false; error: AnvilUriError }

// src/core/uri/grammar.ts
export interface ParsedUri {
  pack?: string
  kind?: ResourceKind
  slug: string
  version?: string
  fragment?: string
}
export function parseGrammar(uri: string): ParsedUri | null

// src/core/uri/format.ts
export function canonicalise(ref: ResourceRef): string  // -> "anvil:[<pack>:]<kind>/<slug>"
export function toShorthand(ref: ResourceRef): string   // -> "<pack>:<slug>" (or "<slug>" for bundled)
```

### 7.3 Existing call sites that migrate

Read-only inventory (from `Grep` for `anvil:`):

- `src/skills/selector.ts` — currently strips `anvil:` prefix manually; migrate to `resolveAnvilUri`.
- `src/hooks/handlers/agent-redirect.ts` — slug extraction from `subagent_type`; migrate.
- `src/intent/router.ts` — routing-rules content references skills by `anvil:<slug>`; migrate.
- `src/opencode-plugin/agents/dispatch.ts` and `agents/mention.ts` — agent dispatch by `anvil:<slug>`; migrate.
- `src/commands/cli/plan-run-dispatcher.ts` — currently parses bare slug; gain optional URI input.

**Migration is incremental.** Each call site keeps accepting bare-slug input; the new resolver is offered as the recommended path. Doctor adds a `URI adoption` row (dev-only initially) that counts call sites still using ad-hoc string parsing.

### 7.4 CLI surface (additive)

```
anvil resolve <uri>            # prints ResourceRef as JSON (debug aid)
anvil skill run anvil:skill/code-review     # parity with bare-slug invocation
```

`anvil resolve` is a debug command — `user-invocable: false` if exposed as a slash command, to stay inside the ≤15 user-invocable cap.

---

## 8. Test Plan

### 8.1 Unit tests

**`grammar.test.ts`** — pure parsing, no I/O.
- Valid: every row in §2.2 examples table parses correctly.
- Valid: shorthand `anvil:code-review` parses with `kind = undefined`.
- Invalid: `anvil:` (empty), `anvil:skill/` (empty slug), `anvil:Skill/x` (uppercase kind), `anvil:skill/Code-Review` (uppercase slug), `anvil:skill/x/y/z` (extra segments), `anvil:skill/../etc/passwd` (traversal stopped by slug regex).
- Round-trip: `canonicalise(parseGrammar(uri))` is identity for canonical inputs.

**`filesystem-map.test.ts`** — pure mapping (no FS reads).
- Each kind maps to the documented root + relative path.
- Pack-qualified URIs resolve under `packsRoot`.
- Plan/ticket kinds resolve under `projectRoot`.

**`resolve.test.ts`** — uses tmp dirs as roots.
- All 7 kinds resolve when the file exists.
- `NotFoundError` when slug is well-formed but missing.
- `AmbiguousKindError` when shorthand form is supplied without `inferredKind`.
- Shorthand with `inferredKind` resolves identically to canonical form.
- Plan kind: prefers `.anvil/plans/v<x>.plan.md` over `docs/anvil/releases/v<x>.md` when both exist; falls back when only the released file exists.

**`security.test.ts`** — path-traversal hardening.
- `anvil:skill/..%2Fetc%2Fpasswd` → `MalformedUriError` (no decoding).
- Pack root containing a symlink to `/etc` → `PathTraversalError`.
- Pack name with `..` is rejected at grammar (regex `[a-z0-9-]+`).
- Resolved `fsPath` always `startsWith` an allowed root (property test).

### 8.2 Integration tests

**`tests/integration/uri-resolution.test.ts`**

- End-to-end: `anvil skill run anvil:skill/code-review` invokes the same skill as `anvil skill run code-review`, identical output up to a routing banner that includes the URI.
- End-to-end: `anvil resolve anvil:ticket/ANV-0095` prints the ticket file's absolute path.
- End-to-end (with ANV-0096 stubbed pack): `anvil skill run anvil:myteam:skill/code-review` resolves under `packsRoot`.
- Adapter integration: a `Skill({skill: "anvil:code-review"})` invocation through the OpenCode adapter (mention.ts/dispatch.ts) resolves via the new resolver and matches CC behaviour.

### 8.3 Doctor row (deferred, but specced here)

`anvil doctor` adds a `URI resolution` row (audience: dev) that:
- Lists every kind and asserts at least one resource of that kind resolves successfully.
- Reports any call site still using ad-hoc `anvil:` parsing instead of the resolver (grep-time check via `grep "anvil:"` audit).

Promote to user-facing when packs land (ANV-0027) and ambiguity becomes user-visible.

---

## 9. Open Questions

These should be resolved before implementation; some require input from ANV-0198 research:

1. **Hook URIs and per-adapter render (depends on ANV-0198).** OpenCode and Claude Code disagree on hook event names. Does `anvil:hook/session-start` resolve to the canonical handler source (`src/hooks/handlers/session-start.ts`) or to an adapter-rendered artifact? Resolution: **canonical handler source**; adapters compute their own per-adapter paths during install. ANV-0198 research confirms build-time projection — adapter paths are derived, not authoritative.
2. **Plan URI version vs slug.** `anvil:plan/v0.15.6` uses the version as the slug. Should version live in the `<version>` segment instead (`anvil:plan/release/v0.15.6`)? **Recommendation:** keep it as the slug — plan files are identified by version, not by name. Single source of truth.
3. **Ticket URI canonical form.** `anvil:ticket/ANV-0095` uses the ANV-ID as slug. The on-disk file name is `ANV-0095-anvil-resource-uri-scheme.md` (ID + descriptive suffix). The resolver glob-matches; agreed.
4. **Skill role segment.** Skills live under `skills/<role>/<slug>/SKILL.md`. The URI omits `<role>`. Resolution searches roles in fixed order (universal → language → role). If a slug exists in two roles, which wins? **Recommendation:** role precedence mirrors current registry override order (universal lowest, role highest). Document the order in the resolver.
5. **Default pack config.** ANV-0096 mentions a deferred `default_pack` setting. Does the URI resolver honour it? **Recommendation:** yes — when `pack` is omitted *and* `default_pack` is set, treat the default pack as the first searched after the bundled root. Tests must cover both with and without.
6. **MCP exposure.** ANV-0037 adds skill MCP metadata. Should the MCP surface expose resources by `anvil:` URI? **Recommendation:** yes; MCP tool descriptors include the canonical URI for every exported skill/agent. This is a downstream win, not blocking for this RFC.
7. **Fragment grammar pinning.** Should consumers register fragment grammars per kind (e.g., `skill` fragments must be `step-<n>`)? **Recommendation:** out of scope here; leave fragment opaque, follow up if a consumer needs structured fragments.

---

## 10. Decision Summary

- Adopt the `anvil:[<pack>:]<kind>/<slug>[/<version>][#<fragment>]` grammar.
- Implement the resolver in `src/core/uri/` (layer 0).
- Accept both canonical and shorthand input; require canonical in on-disk manifests.
- Reuse the existing `Slug` regex from `src/core/worktree/types.ts`.
- Coordinate with ANV-0096 (pack syntax) and ANV-0027 (manifest schema) on the boundary; this RFC is isomorphic with both.
- Effort estimate (implementation): **m** (matches ticket frontmatter).
