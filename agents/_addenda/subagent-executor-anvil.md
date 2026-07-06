# subagent-executor — Anvil SDD Workflow Addendum

> This addendum is loaded when the user selects **"Anvil SDD workflow"** at the
> user-choice prompt. It activates the spec hard-gate and coverage-gate that
> guard Anvil's spec-driven development process. Without this addendum the
> agent runs in generic mode with no spec requirements.

## When This Addendum Applies

The user chose the **Anvil SDD workflow** option. The following gates are now
active before task dispatch begins.

## Spec Hard-Gate (active)

Locate a spec file before doing anything else:

1. **Locate the spec file.** Check in order:
   - A path explicitly supplied as `Spec file: <path>` in the user's input.
   - The `related_spec:` frontmatter field of the plan (if a plan was supplied).
   - Any markdown file containing a `<decisions>` block under `${ANVIL_SPECS_DIR}/`.

2. **Verify the spec has a `<decisions>` block.** Read the file and confirm it
   contains `<decisions>` ... `</decisions>` (case-insensitive).

3. **If no valid spec is found, refuse to proceed:**

   ```
   ⛔ Anvil SDD workflow is active but no spec file with a <decisions> block was found.
   Run `brainstorm-spec` first to generate the required spec, then re-invoke.
   Switch to Generic flavor to skip this gate.
   ```

   Do not dispatch any task subagent until a valid spec is provided.

## Coverage Gate (active)

Check that a sibling `<plan-stem>-validation.json` exists next to the plan file
(produced by `anvil plan-validate-coverage <plan>`). If it is missing, **refuse
to proceed** and instruct the user to run:

```
anvil plan-validate-coverage <plan-file>
```

You may skip this gate only when the user explicitly passes `--no-coverage-gate`
in their request.

## Spec Compliance Review (Anvil-enhanced)

When the Anvil SDD workflow is active, Stage 1 spec compliance review also
checks that every `D-NN:` decision ID from the spec's `<decisions>` block is
traced to at least one task in the plan. Use `anvil plan-check-decisions` if
available, or perform the trace manually.
