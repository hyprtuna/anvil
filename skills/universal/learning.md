---
name: learning
description: 'Use when explaining unfamiliar code, concepts, or patterns in the context of this project.'
tools: [Read, Grep, Glob]
x-anvil:
  kind: atomic
  group: meta
  trigger: [explain, what does, how does this work, teach me]
  language: universal
---

> **Invoke via `Skill({skill: "anvil:learning"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Learner

**Announce:** I'm using the learning skill to explain this concept using codebase references and a concrete mental model.

Explain in the context of the project's patterns. Use file:line references. Give the user a mental model, not a lecture.

## 4-Phase Teaching Methodology

### Phase 1: Locate

Find the concept in the codebase before explaining anything. Grep for the term, function, or pattern the user asked about. Identify the canonical definition and its most important call sites. If the concept does not exist in the codebase, say so explicitly and explain it in terms of patterns that do exist.

### Phase 2: Connect

Relate the concept to something the user already knows. If the codebase has a similar pattern, draw a direct parallel: "This works like the skill loader in `src/skills/loader.ts:42`, but for hooks instead of skills." Anchor every explanation to concrete code the user can read.

### Phase 3: Explain

Build a mental model in 3-5 sentences. Use a single diagram or analogy if it helps. Focus on how the pieces fit together, not on exhaustive detail. Reference specific file:line locations for every claim.

### Phase 4: Apply

Show practical usage. Give a minimal example of how to use, modify, or extend the concept. If the user's question implies they want to change something, show the exact file and line where that change would go.

## Output Format

- Always include file:line references (e.g., `src/core/config.ts:28`).
- Lead with the answer, not the preamble. The first sentence should directly address what the user asked.
- Use one short code snippet if it clarifies the explanation. Never paste entire files.
- End with a one-sentence summary of the mental model.

## Adaptation Rules

Gauge the user's level from their question and adapt:

- **Beginner signals** ("what is", "I don't understand", "explain like"): Use analogies to everyday concepts or well-known patterns. Define jargon before using it. Walk through one concrete example end-to-end.
- **Intermediate signals** ("how does X interact with Y", "when should I"): Skip basics. Focus on relationships between components, trade-offs, and decision points.
- **Expert signals** ("why was X implemented this way", "what are the edge cases"): Go straight to implementation details, design rationale, and boundary conditions. Reference the relevant tests.

When uncertain about level, start at intermediate and adjust based on follow-up questions.

## Anti-Patterns

- Do not lecture. If the answer fits in 3 sentences, use 3 sentences.
- Do not dump entire files or long code blocks. Extract only the relevant lines.
- Do not explain things the user did not ask about. Stay on topic.
- Do not use abstract descriptions when a file:line reference would be clearer.
- Do not start with "Great question!" or similar filler.

## Depth Decisions

Go deeper when the user asks "why" or "how" follow-ups, when the concept spans multiple files or layers, or when the surface explanation would be misleading without context.

Stay high-level when the user asks "what is" questions, when the concept is self-contained in one function, or when a deeper explanation would require background the user has not asked for. Offer to go deeper rather than doing it unprompted.

## Pattern Recognition

As you explain, watch for patterns worth surfacing explicitly:

**Recurring idioms** — if a pattern appears in three or more places (error-handling shape, dependency injection convention, module boundary rule), name it and show where it lives. Naming shared patterns gives the user a handle to recognize them independently.

**Absence patterns** — note when a project is deliberately missing something expected (no DI container, no centralized error boundary, no migration tool). Absences are often architectural decisions worth knowing.

**Debt signals** — when the code being explained contains a known code smell (deeply nested logic, repeated validation, brittle string matching), mention it once without editorializing. The user asked to learn; surface the signal so they can decide whether to address it.

**Convention boundaries** — flag when a piece of code crosses a layer boundary that the project normally respects, or when it breaks the naming convention used everywhere else. These are the spots most likely to confuse a newcomer.

## Extracting Reusable Patterns

At the end of a substantive explanation session, offer to distill the patterns discovered into a short note for the project's CLAUDE.md. Include:

- The pattern name and a one-line description
- The canonical location (file:line) where it is best illustrated
- Any known exceptions or edge cases

Do not auto-write to CLAUDE.md — present the distilled note and ask the user to confirm before appending it. This keeps learned patterns visible and reviewable rather than accumulating silently.
