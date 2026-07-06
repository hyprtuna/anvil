---
name: debugging
description: 'Use when investigating a bug systematically — reproduce, isolate, trace, fix, verify.'
tools: [Read, Grep, Glob, Bash, Edit]
x-anvil:
  kind: atomic
  group: meta
  trigger: [debug, bug, error, not working, broken]
  language: universal
  notepads_section: issues
  version: 1.0.0
  source: authored
  confidence: 1
  provenance: {author: anvil-core, lastUpdated: '2026-05-10'}
---

> **Invoke via `Skill({skill: "anvil:debugging"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

## Status
debugging starting — systematic root-cause investigation before any fix attempt

# Debugger

Systematic 4-phase debugging methodology. Every phase must be completed in order.
Skipping phases leads to guess-fixing, which leads to worse bugs.

---

## The Iron Law

<HARD-GATE>
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.

You do not have permission to change code until you can state:
"The root cause is X, and I know this because Y."

If you cannot complete that sentence, you are still in Phase 1.

"I think it might be X" is NOT a root cause statement. Evidence required.
- What exact value is wrong?
- Where did it first become wrong?
- What change introduced the condition that allows it to be wrong?

Until you can answer all three, you are investigating, not fixing.
</HARD-GATE>

---

## Red Flags — Stop Immediately If You Catch Yourself Saying:

| Red Flag | What It Really Means |
|---|---|
| "Quick fix for now" | You don't understand the problem |
| "Just try changing X" | You are guessing, not debugging |
| "Let me add multiple changes at once" | You will not know which one worked |
| "It works on my machine" | You have not reproduced it properly |
| "That's weird, let me try something else" | You skipped root cause analysis |
| "I think it might be..." (without evidence) | You are speculating, not investigating |
| "Let me just restart/rebuild/clear cache" | You are hoping the problem goes away |

If any of these apply, return to Phase 1. No exceptions.

---

## Phase 1: Root Cause Investigation

This is the longest phase. That is correct. Do not rush it.

### Step 1.1: Read the Error Carefully

- Read the ENTIRE error message. Stack traces, line numbers, error codes — all of it.
- Do not skim. Do not skip past "noise." The answer is often in the part you want to skip.
- Copy the exact error message. You will reference it later.
- If there is no error message (silent failure), that is important information. Note it.

### Step 1.2: Reproduce Consistently

- Write down the exact steps to reproduce. Every time? Or intermittent?
- If intermittent: gather more data before proceeding. Check logs, add instrumentation, identify patterns (timing, load, input-dependent?).
- If you cannot reproduce it, you cannot debug it. Gather more data.
- Create a minimal reproduction case if possible — strip away everything unrelated.

### Step 1.3: Check Recent Changes

- `git diff` — what changed since this last worked?
- `git log --oneline -20` — recent commits that might be relevant.
- Dependency changes — did a package update? Check lock files.
- Config changes — environment variables, feature flags, deployment config.
- Infrastructure changes — new service version, different environment, resource limits.
- If nothing changed and it "just broke," something DID change. You have not found it yet.

### Step 1.4: Trace Data Flow

- Where does the bad value originate? Start at the error and trace BACKWARD.
- At each step: what is the actual value vs. the expected value?
- Use debugging breakpoints, console.log, or diagnostic print statements. No guessing.
- For async code: verify the execution order. Race conditions hide here.
- For multi-component systems: add diagnostic logging at EVERY component boundary.
  - Request leaves Service A with value X.
  - Request arrives at Service B with value Y.
  - If X !== Y, the bug is in the boundary between A and B.

### Step 1.5: Form Your Root Cause Statement

Before leaving Phase 1, you must be able to say:

> "The root cause is [specific mechanism], and I know this because [specific evidence]."

Examples of GOOD root cause statements:
- "The root cause is that `userId` is null because the auth middleware skips token validation on PUT requests, and I know this because adding a log in the middleware shows the guard clause returning early."
- "The root cause is a race condition between the cache write and the DB read, and I know this because adding a 100ms delay before the read makes the bug disappear consistently."

Examples of BAD root cause statements:
- "Something is wrong with the auth." (Too vague.)
- "I think it might be a timing issue." (No evidence.)
- "The database query returns wrong results." (That is a symptom, not a cause.)

---

## Root-Cause Tracing

The crash site is never the origin. The crash site is where the damage surfaces. Your job
is to trace backward from the crash to the point where bad data entered the system.

### The Backward Trace Protocol

1. **Start at the crash site.** Identify the bad value. What variable is null, wrong, or
   missing? What invariant was violated?
2. **Trace one step back.** Where did that value come from? What set it? What returned it?
3. **Inspect that value at that earlier point.** Is it already wrong there?
4. **Repeat until you reach the origin.** The origin is the first place in the execution
   where the value is wrong. Everything upstream of the origin is fine.

Do not stop at the first point you can add a null check. Keep tracing.

### Example: Route Parameter Mismatch

```
Error: Cannot read properties of undefined (reading 'name')
  at UserProfile.render (UserProfile.tsx:42)
```

**Crash site:** `user.name` is undefined inside `UserProfile.render`.

**Step back 1:** Where does `user` come from? Passed as a prop from `UserPage`.

```tsx
// UserPage.tsx
const user = useSelector(state => state.users[userId])
return <UserProfile user={user} />
```

**Step back 2:** Is `state.users[userId]` wrong? Log it.
Result: `userId` is `"undefined"` (the string), not an actual ID.

**Step back 3:** Where does `userId` come from?

```tsx
const { userId } = useParams()
```

**Step back 4:** What does the route look like?

```tsx
// Route definition
<Route path="/users/:user_id" element={<UserPage />} />
// But the component reads: useParams().userId (not user_id)
```

**Origin found.** The route uses `:user_id` but the component reads `userId`. The parameter
name mismatch means `useParams()` returns `{ user_id: "123" }` while the component
destructures `userId`, getting `undefined`.

**Fix:** Change the route to `:userId` OR change the destructure to `user_id`. Fix at the
origin, not at the crash site.

### What NOT to Do

```tsx
// BAD — symptom suppression
if (!user) return null  // Hides the problem, does not fix it

// BAD — default masking
const user = useSelector(state => state.users[userId]) ?? {}
// Now user.name is still undefined but the error is gone. Data is silently wrong.
```

Both patterns suppress the crash without understanding why `user` is undefined.
The actual bug — the route/param name mismatch — is still there and will cause
silent data errors in production.

The rule: **never add a null check at the crash site without tracing backward first.**
A null check at the crash site is only valid once you have traced to the origin and
determined that null is a legitimate expected value at that point.

---

## Defense in Depth

After you find and fix the root cause, add validation at multiple layers. A single
validation point at the input boundary is not enough. Real systems have many entry
points and many ways to violate assumptions.

### The Three Validation Layers

**Input boundary:** Validate external data immediately when it enters the system.
- HTTP request body, query params, headers
- File reads, environment variables, config files
- External API responses, database rows

**Domain boundary:** Validate data when it crosses between internal modules.
- Service function arguments
- Data transformation results
- State transitions

**Output boundary:** Validate data before it leaves the system.
- Response serialization
- Data written to disk, DB, or external service
- Values passed to external APIs

Each layer validates independently. Do not assume a downstream layer has already
validated. Do not assume an upstream layer has already validated.

### Example: Empty String Propagating Through 4 Layers

The bug: a payment is processed with an empty `customerId`, which creates a corrupt
transaction in the external payment processor.

**Without defense in depth:**

```typescript
// Layer 1 — HTTP handler (no validation)
app.post('/pay', async (req, res) => {
  const result = await paymentService.charge(req.body.customerId, req.body.amount)
  res.json(result)
})

// Layer 2 — Service (no validation)
async function charge(customerId: string, amount: number) {
  const customer = await db.customers.findById(customerId)
  return await stripeClient.charge(customer.stripeId, amount)
}

// Layer 3 — DB query (no validation, returns null for empty string)
// Layer 4 — Stripe call (accepts empty stripeId, creates corrupt record)
```

Empty string flows all the way to Stripe before anything breaks — and by then a
corrupt record exists.

**With validation at multiple layers:**

```typescript
import { z } from 'zod'

// Layer 1 — Input boundary: validate at HTTP handler
const ChargeRequestSchema = z.object({
  customerId: z.string().min(1, 'customerId is required'),
  amount: z.number().positive('amount must be positive'),
})

app.post('/pay', async (req, res) => {
  const parsed = ChargeRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() })
  }
  const result = await paymentService.charge(parsed.data.customerId, parsed.data.amount)
  res.json(result)
})

// Layer 2 — Domain boundary: validate at service entry
async function charge(customerId: string, amount: number) {
  if (!customerId) throw new Error('charge: customerId must not be empty')
  if (amount <= 0) throw new Error('charge: amount must be positive')
  const customer = await db.customers.findById(customerId)
  if (!customer) throw new Error(`charge: customer not found: ${customerId}`)
  return await stripeClient.charge(customer.stripeId, amount)
}

// Layer 3 — Output boundary: validate before external call
async function stripeCharge(stripeId: string, amount: number) {
  if (!stripeId) throw new Error('stripeCharge: stripeId must not be empty')
  return await stripe.charges.create({ customer: stripeId, amount })
}
```

Now the empty string is caught at Layer 1 and never reaches Layer 2, 3, or 4. If
somehow an invalid value bypasses Layer 1, Layer 2 catches it. Each layer is a
independent defense. No layer trusts the others.

### When Validation Overlaps

Validation at multiple layers WILL produce some redundancy. That is intentional.
The redundancy is cheap (a few microseconds). Silent data corruption is expensive.
Prefer redundant validation over trusting that "someone else already checked this."

---

## Condition-Based Waiting

Never use arbitrary `sleep()` or `setTimeout()` to wait for async operations to
complete. Arbitrary waits are fragile: too short fails on slow machines, too long
wastes time. Both hide the real problem.

### The Problem With Arbitrary Waits

```typescript
// BAD — arbitrary sleep
await new Promise(resolve => setTimeout(resolve, 5000))
const result = await db.query('SELECT * FROM jobs WHERE id = ?', [jobId])
expect(result.status).toBe('complete')
```

This test passes on your machine (job finishes in 2s) and fails in CI (job takes 6s
under load). The 5000ms is a guess, not a condition. When it fails, the failure
message tells you nothing useful.

### The Condition-Based Pattern

Replace the arbitrary wait with a function that polls for a condition, retries on
a configurable interval, and times out with a useful error:

```typescript
// GOOD — poll for condition
async function waitFor<T>(
  condition: () => Promise<T | null | undefined | false>,
  options: { timeout?: number; interval?: number; label?: string } = {}
): Promise<T> {
  const { timeout = 10_000, interval = 100, label = 'condition' } = options
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const result = await condition()
    if (result) return result
    await new Promise(resolve => setTimeout(resolve, interval))
  }
  throw new Error(`waitFor: timed out after ${timeout}ms waiting for ${label}`)
}

// Usage in test
const result = await waitFor(
  () => db.query('SELECT * FROM jobs WHERE id = ? AND status = ?', [jobId, 'complete']),
  { timeout: 15_000, interval: 200, label: `job ${jobId} completion` }
)
expect(result.status).toBe('complete')
```

When the timeout fires, you get: `waitFor: timed out after 15000ms waiting for job
42 completion` — a message that tells you exactly what did not happen and how long
you waited.

### Where to Use Condition-Based Waiting

- **Tests:** Any test that waits for an async side effect (queue message processed,
  file written, job completed, cache invalidated).
- **CI scripts:** Health-check loops waiting for a service to become ready.
- **Application code:** Polling for external state that changes asynchronously
  (payment webhook received, deployment finished, peer sync completed).

### Adjusting the Parameters

| Scenario | timeout | interval |
|---|---|---|
| Unit test, fast in-process op | 2 000ms | 50ms |
| Integration test, local DB/queue | 10 000ms | 100ms |
| E2E test, full pipeline | 60 000ms | 500ms |
| CI service ready check | 120 000ms | 1 000ms |

Set `timeout` to the maximum time the operation should ever take under worst-case
conditions. Set `interval` to the minimum polling granularity you need. Do not set
`interval` lower than 50ms — you will burn CPU for no gain.

---

## Phase 2: Pattern Analysis

Now that you have a hypothesis, validate it against the codebase.

### Step 2.1: Find Working Examples

- Search the codebase for similar code that WORKS correctly.
- How do other callers handle the same API, the same data, the same pattern?
- If nothing similar exists, look at reference implementations or documentation.

### Step 2.2: Compare Completely

- Put the working code and broken code side by side.
- List EVERY difference, however small:
  - Different argument order?
  - Different error handling?
  - Different initialization sequence?
  - Missing null check?
  - Different async/await pattern?
- Do not skim. Read every line. The bug hides in the difference you dismiss as irrelevant.

### Step 2.3: Understand Dependencies and Assumptions

- What does the broken code assume about its inputs?
- What does it assume about execution order, state, environment?
- Are those assumptions documented? Are they still valid?
- Check: did an upstream change violate an assumption this code relies on?

---

## Phase 3: Hypothesis and Testing

### Step 3.1: State a Single, Specific Hypothesis

Write it down explicitly:

> "I think [X] is the root cause because [Y]. If I am right, then [Z] should fix it."

This must be ONE hypothesis. Not "it could be A or B." Pick one. Test it.

### Step 3.2: Test Minimally

- Change ONE variable at a time. The smallest possible change.
- If you change multiple things, you will not know which one mattered.
- Add a test or diagnostic that specifically validates your hypothesis.
- Predict the outcome BEFORE running the test. If the outcome surprises you, your model is wrong.

### Step 3.3: Evaluate the Result

**If the hypothesis was correct:**
- Proceed to Phase 4.

**If the hypothesis was wrong:**
- REVERT your test change. Do not leave experimental code in place.
- Form a NEW hypothesis based on what you learned.
- Do NOT add more fixes on top of the failed one. That is stacking guesses.
- Return to Step 3.1.

### Step 3.4: Honesty Check

- If you do not know what is happening, say so. Do not pretend.
- If the behavior contradicts your mental model, your mental model is wrong. Update it.
- "I don't understand why this happens" is a valid and useful statement. It means you need more data, not more guesses.

---

## Phase 4: Implementation

### Step 4.1: Write a Failing Test

- Before writing the fix, write a test that reproduces the bug.
- The test should FAIL on the current code and PASS after the fix.
- This is your proof that the fix actually addresses the problem.
- This test stays in the suite permanently — it prevents regression.

### Step 4.2: Implement the Fix

- Address the ROOT CAUSE, not the symptom.
  - Bad: add a null check around the crash site.
  - Good: fix the upstream code that produces the null in the first place.
- Make the smallest change that fixes the root cause.
- Do not "improve" nearby code while you are fixing a bug. Separate concerns.

### Step 4.3: Verify Completely

- The new test passes.
- ALL existing tests still pass. No regressions.
- Manually verify the original reproduction case is fixed.
- If there were related symptoms, verify those are also resolved.

### Step 4.4: Document

- Commit message explains the root cause and the fix, not just "fix bug."
- If the bug revealed a systemic issue, note it for future work.

---

## The 3+ Fixes Rule

Track your fix attempts:

| Attempt | Hypothesis | Result |
|---|---|---|
| 1 | ... | Failed / Succeeded |
| 2 | ... | Failed / Succeeded |
| 3 | ... | Failed / Succeeded |

**If you have attempted 3 fixes and none worked: STOP.**

This is no longer a simple bug. You are likely facing one of:
- An architectural problem that cannot be fixed locally.
- A misunderstanding of the system's design or invariants.
- A problem in a layer you do not control.

**Do not attempt fix #4.** Instead:
1. Document what you tried and what you learned.
2. Escalate to the human with your findings.
3. Ask: "Is this the right architecture for what we're trying to do?"

Three failed fixes is evidence that the problem is bigger than the code you are looking at.

---

## Debugging Checklist (Quick Reference)

- [ ] I can state the root cause with evidence.
- [ ] I have reproduced the bug consistently.
- [ ] I have checked recent changes (git diff, deps, config).
- [ ] I have traced data flow to the point of failure.
- [ ] I have found working examples of similar code.
- [ ] I have compared working vs. broken completely.
- [ ] My hypothesis is specific and testable.
- [ ] I am changing one variable at a time.
- [ ] I wrote a failing test before writing the fix.
- [ ] All tests pass after the fix.
- [ ] I have not exceeded 3 fix attempts.

## Done
debugging done — root cause identified and fix verified with failing test turned green; status: DONE
