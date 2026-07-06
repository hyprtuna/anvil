## Summary

<!-- 1-3 bullet points describing what changed and why -->

## Type of change

- [ ] Bug fix
- [ ] New feature / addition
- [ ] Improvement to existing feature
- [ ] Refactor / technical debt
- [ ] Docs / DX
- [ ] Release

## Test plan

<!-- Bulleted checklist of what you tested -->

- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run test` passes
- [ ] Manually verified: <!-- describe -->

## Adapter changes (ANV-0101)

> Skip this section if you did not touch `src/adapters/` or `src/opencode-plugin/`.
> See `docs/adapter-transcript-policy.md` for the full policy.

- [ ] I **did not** touch `src/adapters/` or `src/opencode-plugin/` → skip below.
- [ ] I **did** touch an adapter — transcript captured at
      `transcripts/<YYYY-MM-DD>-<adapter>.json` showing:
  - [ ] Bootstrap injection: `using-anvil` skill (or platform equivalent) delivered at
        session start (`bootstrap_injected: true` + supporting message in transcript).
  - [ ] Skill auto-trigger: model invoked `Skill({skill: "anvil:<slug>"})` in response
        to the canonical Anvil prompt (`skill_triggered: true` + supporting message).

## Release discipline checklist (skip for docs-only PRs)

- [ ] Mix of risk-reduction + new value (per `docs/release-policy.md`).
- [ ] Changelog updated if user-facing.
- [ ] No single item exceeds 40 % of the diff.
