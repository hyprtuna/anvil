---
name: architecture-decision-record
user-invocable: true
description: 'Use when a non-trivial architectural decision needs to be recorded — captures context, alternatives, and rationale in a structured ADR.'
tools: [Read, Write, Glob]
x-anvil:
  kind: atomic
  group: documentation
  trigger: [ADR, record this decision, architecture decision, why did we choose]
  language: universal
  templates: [tickets, decisions]
---

# Architecture Decision Record

Capture architectural decisions as they happen. Decisions that live in Slack threads or PR comments disappear; ADRs live alongside the code and survive contributor turnover.

## When to Activate

- User says "record this decision", "ADR this", or "let's document why we chose X".
- A significant architectural choice is being made between alternatives.
- User asks "why did we choose X?" (read existing ADRs).
- During planning when architectural trade-offs are being discussed.

Suggest recording an ADR (but do not auto-create) when the conversation shows:
- Comparing two frameworks or libraries and reaching a conclusion
- Database schema design with stated rationale
- Choosing between architectural patterns
- Deciding on an authentication or authorization strategy

## ADR Format

${TEMPLATE:tickets}

## Proposing a decision (interactive surface)

When the ADR is at the proposal stage and the user has not yet picked
between alternatives, surface the choice using the canonical decision
template. Wait for the user's answer per the `decision-template-discipline`
rule before writing the ADR file:

${TEMPLATE:decisions}

## Workflow

### Capturing a New ADR

1. **Initialize** — if `docs/adr/` does not exist, ask the user before creating it.
2. **Identify the decision** — extract the core architectural choice.
3. **Gather context** — what problem prompted this? What constraints exist?
4. **Document alternatives** — what was considered and why was each rejected?
5. **State consequences** — what becomes easier or harder?
6. **Assign a number** — scan existing ADRs and increment.
7. **Confirm first** — present the draft for user review. Only write to `docs/adr/NNNN-decision-title.md` after explicit approval.
8. **Update the index** — append a row to `docs/adr/README.md`.

### Reading Existing ADRs

When a user asks "why did we choose X?":

1. Check if `docs/adr/` exists — if not, offer to start recording.
2. Scan `docs/adr/README.md` for relevant entries.
3. Read matching ADR files and present the Context and Decision sections.
4. If no match found: "No ADR found for that decision. Would you like to record one now?"

## Directory Structure

```
docs/
└── adr/
    ├── README.md          ← ADR index table
    ├── 0001-use-nextjs.md
    ├── 0002-postgres-over-mongo.md
    └── template.md        ← blank template for manual use
```

## ADR Index Format

```markdown
# Architecture Decision Records

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [0001](0001-use-nextjs.md) | Use Next.js as the frontend framework | accepted | 2026-01-15 |
```

## ADR Lifecycle

```
proposed → accepted → [deprecated | superseded by ADR-NNNN]
```

- **proposed** — under discussion, not yet committed
- **accepted** — in effect and being followed
- **deprecated** — no longer relevant (e.g., feature removed)
- **superseded** — a newer ADR replaces this one; always link the replacement

## What Makes a Good ADR

- **Be specific** — "Use Prisma ORM" not "use an ORM".
- **Record the why** — rationale matters more than the what.
- **Include rejected alternatives** — future developers need to know what was considered.
- **State consequences honestly** — every decision has trade-offs.
- **Keep it short** — readable in two minutes. Context section max 10 lines.
- **Use present tense** — "We use X" not "We will use X".

## Anti-patterns

- Recording trivial decisions (variable naming, formatting choices).
- Omitting alternatives — "we just picked it" is not valid rationale.
- Backfilling without marking the original date.
- Letting accepted ADRs go stale when the system changes — supersede them.

## Decision Categories Worth Recording

| Category | Examples |
|---|---|
| Technology choices | Framework, language, database, cloud provider |
| Architecture patterns | Monolith vs microservices, event-driven, CQRS |
| API design | REST vs GraphQL, versioning strategy, auth mechanism |
| Data modeling | Schema design, normalization, caching strategy |
| Security | Auth strategy, encryption approach, secret management |
| Testing | Framework, coverage targets, E2E vs integration balance |
| Process | Branching strategy, review process, release cadence |
