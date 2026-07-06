**Each decision must contain four parts** — anything thinner is a placeholder, not a decision:

1. **The question** — what specifically needs deciding, framed as a one-line statement of the choice. Avoid vague nouns ("storage approach"); name the concrete decision ("where to store SDD artifacts").
2. **The options** — at least two, each with a short explanation (≤ 2 lines). One-line option names without the tradeoff are not enough; the explanation tells the reader *what they give up* by picking one over another.
3. **The recommendation** — exactly one option, named explicitly. Equivocation (`A or B both reasonable`) defers the decision to the implementer; that's an Open Question, not a decision.
4. **The reason** — why this option wins given the constraints in this spec. Reference the codebase scan, prior plans, or risk profile. "Simpler" alone is not a reason.

**Decision ID convention (mandatory):** every decision MUST be tagged with a zero-padded
two-digit ID using the format `D-NN:` — `D-01:`, `D-02:`, `D-03:`, and so on. IDs may
extend beyond two digits (`D-10:`, `D-11:`, …) but must never use fewer than two digits.

**Decision template (use this shape verbatim in the spec's `<decisions>` block):**

```
D-NN: <One-line question — what needs to be decided>

Options:
  A) <Option name> — <≤2-line explanation; what you give up vs the others>
  B) <Option name> — <≤2-line explanation>
  C) <Option name> — <≤2-line explanation>     # add as needed; A/B minimum

Recommendation: <A | B | C>
Reason: <why this option wins given THIS spec's constraints; cite scan,
         prior plan, or risk profile. 1-3 lines.>
```

**Worked example:**

```
D-01: Where SDD artifacts (spec.md, plan.md, tasks.md) live on disk

Options:
  A) .anvil/specs/features/<slug>/ — versioned, git-tracked, picked up by
                                     PR review; matches the .anvil/{plans,specs}/
                                     convention used since v0.12.2.
  B) .anvil/features/<slug>/     — gitignored; transient state only;
                                   artifacts disappear from PR diffs
                                   and code-archaeology.
  C) <slug>/anvil/               — colocated with feature code; clear
                                   locality but scatters spec/plan
                                   discovery across the repo tree.

Recommendation: A
Reason: Anvil
        already uses .anvil/{plans,specs}/. Per-feature directory
        groups the SDD trio so PR review captures spec+plan+tasks in
        one diff. (B) was the original v0.10.0 draft; rejected because
        gitignored artifacts can't be reviewed.
```
