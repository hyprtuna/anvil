# read-background-results — Anvil Addendum

> This addendum is loaded when running inside an Anvil project (`.anvil/` detected).
> It provides the `ANVIL_BACKGROUND_RESULTS` env var convention and Anvil-specific
> file path discovery logic for the background results file.

## When This Addendum Applies

Load this addendum when:
- The runtime is operating inside an Anvil project (`.anvil/` directory present).
- No explicit background results file path was provided by the caller.

## ANVIL_BACKGROUND_RESULTS Environment Variable

In Anvil orchestration contexts, the background results file path is set via the
`ANVIL_BACKGROUND_RESULTS` environment variable. The orchestrator sets this variable
before launching parallel agents so all agents in the wave write to the same file.

To discover the path:

```
1. Read process.env.ANVIL_BACKGROUND_RESULTS
2. If set and non-empty, use that path.
3. If not set, fall back to .anvil/background-results/<wave-id>.md (if a wave ID is
   available from the dispatch envelope).
4. Otherwise, fail with NEEDS_CONTEXT.
```

## File Format Conventions

In Anvil context, the background results file name follows the pattern:

```
.anvil/background-results/<YYYY-MM-DD>-<slug>.md
```

Example: `.anvil/background-results/2026-05-16-auth-wave-1.md`

The orchestrator creates this file before launching the parallel fan-out and
appends results as each agent completes. The read-background-results skill
is invoked after all agents in the wave have finished.

## Error Output (Anvil context)

If `ANVIL_BACKGROUND_RESULTS` is set but the file is missing or empty:

```
⚠ ANVIL_BACKGROUND_RESULTS is set to '<path>' but the file is empty or does not exist.
  Check that the orchestrator wave completed successfully before invoking this skill.
```
