---
name: orchestrator-guide
user-invocable: false
description: 'Use when orchestrating parallel agents — guidance on when to fan out, how to compose results, TDD discipline.'
tools: [Task, Read]
x-anvil:
  kind: atomic
  group: planning
  trigger: [orchestrate, fan out, dispatch agents, parallel agents]
  language: universal
---

# Orchestrator Guide

This is a reference document for orchestrating parallel subagents well. Read it before dispatching any Task() calls. The goal is not to fan out aggressively — it is to fan out *correctly*, compose outputs *accurately*, and know *when to stop and ask*.

---

## 1. When to Fan Out

Fan out **only when all three conditions hold**:

1. **The subtasks are genuinely independent.** No subtask needs the output of another to begin. If subtask B requires data from subtask A, they must run sequentially, not in parallel.
2. **Context can be cleanly partitioned.** Each subagent can be given a complete, self-contained prompt without referencing shared mutable state.
3. **There are 3 or more subtasks in the whole goal.** For 1-2 total subtasks the overhead of spawning, prompting, and collecting agents outweighs the marginal gain — do them inline. For 3+ subtasks, orchestration is the default even if the dependency graph is linear across waves — see the multi-wave example below.

**Do NOT fan out when:**
- Tasks are sequential by nature (e.g., "write code, then test it" — the test needs the code).
- Subagents would need to read each other's outputs mid-flight.
- The total work is small enough that a single agent can finish it in one pass.
- You are uncertain about the task decomposition — clarify first, then dispatch.

**Correct fan-out pattern:**
```
Goal: Audit three independent modules for security issues.
→ Dispatch three agents in parallel, one per module.
→ Each agent gets: the module path, the audit rubric, the output format.
→ Collect all three results, then synthesize.
```

**Incorrect fan-out pattern (genuinely un-waveable):**
```
Goal: Rename a single internal symbol used in three files.
→ A single agent is faster than three coordinated ones — the work is mechanical,
  tightly coupled, and identical across files.
→ Dispatch one agent with the full file list, or do it inline.
```

**Correct multi-wave pattern for a feature release** (this is the *common* shape, not the exception):
```
Goal: Ship a bug fix with a failing test, a CHANGELOG entry, and a version bump.
→ Wave 1 (parallel): [write failing test] · [investigate root cause] · [draft CHANGELOG]
→ Wave 2 (parallel): [implement fix against the test] · [finalize CHANGELOG from wave 1 findings]
→ Wave 3 (parallel): [run full test suite] · [bump package.json]
→ Sequential tail: commit, push, PR, merge.
Each wave is a single `Task()` batch. Three waves of parallel dispatch is the norm
for feature/release work — not an anti-pattern.
```

---

## 2. How to Scope a Subagent Prompt

Every Task() call spawns a **fresh agent with zero context** from your conversation. It cannot see your history, your previous outputs, or anything you haven't explicitly included in the prompt. Write each subagent prompt as if it will be read by a capable engineer who knows nothing about the task except what you tell them.

**A well-scoped subagent prompt must include:**

1. **The goal** — one sentence, unambiguous. What must be true when the agent finishes?
2. **The relevant file paths** — exact paths. Don't say "the authentication module"; say `src/auth/session.ts`.
3. **The expected output format** — what should the agent return? A markdown section? A JSON object? A list of findings? Be explicit.
4. **Constraints and what NOT to do** — if the agent must not modify certain files, say so. If it must not make API calls, say so. Silence is permission — be explicit about limits.
5. **The context the agent cannot infer** — if there's a relevant design decision, a known issue, or a naming convention, include it. The agent has no access to your memory.

**Example of a good subagent prompt:**
```
Audit `src/payments/stripe.ts` for security vulnerabilities.
Focus on: input validation, secret handling, error message leakage.
Do NOT modify any files.
Return your findings as a markdown list: one finding per bullet,
each with severity (high/medium/low) and the line number.
Context: This module uses Stripe API v3. The `STRIPE_SECRET` env var
must never appear in logs or error messages.
```

**Example of a bad subagent prompt:**
```
Check the payments code for issues.
```
This is too vague. The agent will make assumptions that may not match your intent.

---

## 3. How to Compose Outputs

After all subagents complete, you have a set of results. Composing them correctly is as important as dispatching correctly.

**The composition process:**

1. **Collect all results before synthesizing.** Do not start writing a synthesis while some agents are still running. Wait for all results.
2. **Check each result for completeness.** Did each agent address its assigned scope? If a result is clearly partial (e.g., it only covers half the files it was given), note the gap before synthesizing.
3. **Identify disagreements explicitly.** If agent A says "this function is safe" and agent B says "this function has a vulnerability," do not average them or pick one silently. Surface the disagreement: *"Agent A and Agent B produced contradictory assessments of X. Agent A found... Agent B found... The resolution depends on..."*
4. **Synthesize into a single coherent result.** After resolving or flagging disagreements, produce one unified output. Structure it clearly — the reader should not need to mentally merge multiple agent outputs themselves.
5. **Attribute findings to their source.** When reporting, indicate which subagent produced which finding. This aids debugging when a finding turns out to be wrong.

**Never:**
- Silently drop one agent's output in favor of another's.
- Average contradictory conclusions without noting the contradiction.
- Present a synthesis as if you generated it from scratch when it came from subagents.

---

## 4. Async-Turn Discipline

Background agents (`run_in_background: true`) communicate via completion notifications. Between notifications the UI shows nothing moving. Five concrete gotchas follow from this model.

### 4.1 Yielding While Agents Run

Do not yield with a bare "awaiting the others..." message while agents are in flight. Fill the waiting turn with non-blocking prep: read the source files the next wave will need, pre-verify assumptions via a dry-run CLI command (e.g., `./bin/anvil.cjs route --json "<prompt>"`), draft CHANGELOG entries, or check git state. This work informs the next dispatch's prompts with zero wasted latency.

When 1-of-3 agents returns while two are still running, use the remaining turn to read the files the next wave will touch and pre-verify assumptions — this means the moment the last notification arrives you can dispatch immediately with fully-formed prompts rather than spending that turn on reads.

If nothing productive remains to prep, yield with a structured message that names the in-flight agents: *"Waiting on agent-2 (selector tuning) and agent-3 (test tightening). agent-1 (banner wire-up) returned DONE."*

### 4.2 Partial Completion Handling

When one agent in a wave returns a partial or blocked result while others are still running, do not re-dispatch immediately. Wait for the full wave to report first. Re-dispatching mid-wave risks solving a phantom problem because:

- A sibling agent may have already addressed the overlapping concern.
- The apparent blocker may be resolved by work a sibling agent is producing right now.
- Dispatching a duplicate into a live wave risks conflicting edits to shared files.

Gather the whole wave, assess the combined state, then decide whether a re-dispatch is needed and what its scope should be.

### 4.3 Heterogeneous Result Composition

When wave results arrive in mixed states (some `DONE`, some partial, some failed), do not majority-vote or average the outputs. Apply these filters in order:

1. **Hard filter:** keep only results that pass all tests. A partial result that leaves tests red is not a candidate.
2. **Soft filter:** among surviving results, prefer the one most closely aligned with the original goal statement.

If two agents edited the same file with different approaches, keep one result entirely and discard the other. Do not attempt to merge. Merges of independently-generated code almost always introduce inconsistencies that neither agent's tests cover.

### 4.4 Cascade Failure Retry Budget

The "retry once on failure" rule can cascade into dispatch budget exhaustion when five agents all hit the same root cause (a broken dependency, a missing fixture, a mis-specified interface). Cap retries at **2 per wave**. If two retries have already been consumed in the current wave, escalate to the user rather than retrying further. Describe the common root cause as specifically as you can — the human can resolve systemic blockers faster than a third dispatch attempt.

### 4.5 Notification Timing Expectations

Typical background-agent round-trip is 30 seconds to 8 minutes depending on scope. Treat durations above 5 minutes as cache-boundary territory — a stalled notification after 8+ minutes usually means the agent hit a hard stop rather than completing silently. When dispatching an agent whose task is likely to take more than 2–3 minutes, include an expected duration in the dispatch prompt ("this sub-task should take roughly 5 minutes"). This sets your own expectation correctly so you know whether to keep prepping (under 5 minutes remaining) or to yield and wait for the notification (work is complete and you have nothing left to prep).

---

## 5. When to Stop and Ask the Human

Orchestration is not autonomous at all costs. There are conditions where the correct action is to stop, surface the problem, and wait for human input.

**Stop and ask when:**

1. **Subagents return contradictory plans with no clear winner.** If two agents propose mutually exclusive approaches and neither is obviously correct, you cannot resolve this — the human must choose.
2. **The task requires human judgment or authorization.** Credentials, policy decisions, production deployments, legal or compliance questions — these are never for an agent to decide. Surface them immediately.
3. **Two or more subagents return BLOCKED status.** A BLOCKED result means an agent hit a wall it cannot get past. If this happens in multiple subtasks, the original task decomposition was likely wrong, or there is a systemic problem you need the human to resolve.
4. **The scope turns out to be larger than originally stated.** If exploration reveals the task will take 10x the expected work, stop and confirm before proceeding. Don't autonomously expand scope.
5. **You discover sensitive data or a security issue that requires human review.** Don't act on it unilaterally.

**How to stop and escalate:**
```
I need to pause and get your input before continuing.

Here is what I found:
- [Agent A result summary]
- [Agent B result summary]

The problem: [specific contradiction or blocker]

What I need from you: [specific question or decision]
```

Do not apologize excessively. State the problem, state what you have, state what you need.

---

## 6. TDD Loop Discipline

When the task involves writing or modifying code, orchestration must enforce the TDD loop. An agent that produces code without verifying it passes tests has not completed its subtask — it has produced a candidate.

**The mandatory code subagent chain:**

```
1. Plan → What files will be changed, and how?
2. Implement → Write the code.
3. Test → Run the test suite (or write tests first if doing TDD).
4. Verify → Confirm tests pass and no regressions are introduced.
```

Each subagent in a code-writing chain must end its output with:
- The test command it ran.
- The test output (pass/fail counts, failure messages if any).
- A clear statement: PASSING or FAILING.

**Do not accept a code result without test verification.** If a subagent returns code but no test results, re-dispatch it with explicit instructions to run the tests and report the output.

**If tests fail:**
- Re-dispatch the agent with: (a) the failing test output, (b) the code it wrote, (c) a request to diagnose and fix.
- If it fails a second time, escalate to the human rather than dispatching a third time blindly.

**For TDD-first workflows:**
- Dispatch a "write tests" agent first.
- Only dispatch the "implement" agent after the tests exist and are confirmed to fail (red).
- After implementation, verify the tests pass (green).
- Then dispatch a "refactor" agent if needed, verifying tests remain green.

The TDD loop is not optional for code tasks. A synthesis of code-generating subagents that skips test verification is incomplete by definition.
