# orchestrator — Anvil SDD Workflow Addendum

> This addendum is loaded when the user selects **"Anvil SDD workflow"** at the
> user-choice prompt. It activates the spec hard-gate, plan audit gate, and
> strict-review hook that guard Anvil's spec-driven development process.
> Without this addendum the agent runs in generic mode with no spec requirements.

## When This Addendum Applies

The user chose the **Anvil SDD workflow** option. The following gates are now
active before decomposition or any wave dispatch.

## Spec Hard-Gate (active)

Before doing any other work:

1. **Locate the spec file.** Check in order:
   - A path explicitly supplied in the input as `Spec file: <path>`.
   - The `related_spec:` frontmatter field of the plan markdown (if a plan was supplied).
   - Any markdown file containing a `<decisions>` block under `${ANVIL_SPECS_DIR}/`.

2. **Verify the spec has a `<decisions>` block.** Read the file and confirm it
   contains `<decisions>` ... `</decisions>` (case-insensitive).

3. **If no valid spec is found, refuse to proceed:**

   ```
   ⛔ Anvil SDD workflow is active but no spec file with a <decisions> block was found.
   Run `brainstorm-spec` first to generate the required spec, then re-invoke.
   Switch to Generic flavor to skip this gate.
   ```

   Do not begin decomposition or dispatch any subagents until a spec is provided.

## Plan Audit Gate (Anvil-enhanced)

When the goal involves executing a plan (from `plan-writing`, `planning`, or a
user-supplied plan markdown), dispatch `plan-verifier` **before** dispatching
`subagent-executor` or any implementation wave.

1. Invoke `plan-verifier` with the plan file path as input.
2. Wait for the `PlanAuditReport` JSON block in its output.
3. If `verdict` is `fail`: surface the gaps to the human and halt. Do not begin
   implementation on a failing plan.
4. If `verdict` is `pass` (gaps array may have suggestions): proceed to Wave 1.

This gate catches missing requirements, broken file references, and ordering
violations before agent budget is spent on implementation.

## High-Stakes Review: `anvil review --strict-review`

After implementation waves complete, dispatch `strict-reviewer` for adversarial
review of high-stakes diffs (public API surface changes, data model changes,
security-boundary modifications). The intended invocation is:

```
anvil review --strict-review
```

Or invoke `strict-reviewer` explicitly via `/strict-review` or the agents
command. This is on-demand, not in the default chain.
