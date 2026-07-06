# src/skills/ — AI Developer Notes

Layer 1. Skill system TypeScript: loader, selector, chain, runtime. (Skill content — the `.md` files — lives in `/skills/` at the repo root.)

## Files

- `loader.ts` — parses YAML frontmatter, validates against `SkillSchema` (from `src/core/types.ts`), registers in the `SkillRegistry`.
- `selector.ts` — intent → skill mapping. Reads `ProjectContext` and user prompt, emits an ordered list of candidate skills.
- `chain.ts` — composes skill chains for multi-role intents (Tier 1 sequential orchestration).
- `runtime.ts` — invocation interface.

## Rules

- Skills loaded from three tiers: `skills/universal/`, `skills/languages/<lang>/`, user dirs. User > language > universal (last wins).
- Loader errors must be actionable: include file path, line, frontmatter field, expected vs actual.
- Selector is pure — no I/O — takes context in, emits skill names out.
