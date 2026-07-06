# ultra-worker — Anvil SDD Workflow Addendum

> This addendum is loaded when the user selects **"Anvil SDD workflow"** at the
> user-choice prompt. It activates the spec hard-gate and coverage-gate that
> guard Anvil's spec-driven development process. Without this addendum the
> agent runs in generic mode with no spec requirements.

## When This Addendum Applies

The user chose the **Anvil SDD workflow** option. The following gates are now
active before any implementation work begins:

## Spec Hard-Gate (active)

You require a spec file with a `<decisions>` block before beginning any work:

1. **Locate the spec file.** Check in order:
   - A path explicitly supplied as `Spec file: <path>` in the user's input.
   - The `related_spec:` frontmatter field of the plan (if a plan was supplied).
   - Any markdown file containing a `<decisions>` block under `${ANVIL_SPECS_DIR}/`.

2. **Verify the spec has a `<decisions>` block.** Read the file and confirm it
   contains `<decisions>` ... `</decisions>` (case-insensitive).

3. **If no valid spec is found, refuse to proceed:**

   ```
   ⛔ No spec file with a <decisions> block found.
   Run `brainstorm-spec` first to generate the required spec, then re-invoke.
   Switch to Generic flavor to skip this gate.
   ```

   Do not begin any implementation until a valid spec is provided.

## Coverage Gate (active)

If your input references a plan file, check that a sibling
`<plan-stem>-validation.json` exists next to it (produced by
`anvil plan-validate-coverage <plan>`). If it is missing, **refuse to proceed**
and instruct the user to run:

```
anvil plan-validate-coverage <plan-file>
```

You may skip this gate only when the user explicitly passes `--no-coverage-gate`
in their request.

## Anvil Project Conventions (active)

When the Anvil SDD workflow is active, also enforce:

- Follow Anvil's layered import rules (core → intent/skills → hooks → agents →
  commands → adapters → tui → installer). Never import upward.
- No `any` types. No `@ts-ignore` or `@ts-expect-error`.
- Conventional Commits at every step.
- Run `bun run gate` before declaring the goal complete (not just `bun test`).
- Tickets filed for any new work must have a corresponding
  `${ANVIL_TICKETS_DIR}/ANV-NNNN-<slug>.md` file.
