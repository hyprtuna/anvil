# Manual Smoke Tests

Scripts in this directory verify real-SDK or real-subprocess behaviours that
cannot be tested deterministically in `npm test`. They are **not part of the
automated test suite** and must be invoked explicitly, typically pre-release.

## When to run

- Before tagging a new release when SDK integration or subprocess behaviours
  may have drifted.
- After upgrading `@anthropic-ai/sdk` or changing the `on-large-output` hook.
- When investigating a production report about summarization output quality.

## How to run

Each script reads `ANTHROPIC_API_KEY` from the environment and fails fast with
a clear error message if it is absent.

```bash
ANTHROPIC_API_KEY=sk-ant-... bun run scripts/manual-tests/summarizer-live-sdk.ts
```

Or via the package.json alias:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run smoke:summarization
```

## Scripts

### `summarizer-live-sdk.ts`

**Purpose:** Validates the full `on-large-output` hook → subprocess summarization
→ Anthropic SDK roundtrip with a real API call.

**What it tests:**
- The handler correctly spawns `anvil skill run summarization` (or equivalent
  subprocess runtime) against live input.
- The returned summary is ≤200 words.
- The stash file path is returned.

**Replaces:** The `ANVIL_LIVE_SDK_TESTS=1`-gated `describe.skipIf` block that
was removed from `tests/integration/compression-summarizer-roundtrip.test.ts`
in Plan 34 Phase E2.

**Invocation:**

```bash
ANTHROPIC_API_KEY=sk-ant-... bun run scripts/manual-tests/summarizer-live-sdk.ts
```

Exit 0 on pass, non-zero on failure.
