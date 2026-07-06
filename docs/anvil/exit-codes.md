# Anvil CLI Exit Codes

This document is the canonical reference for exit codes used by the `anvil` binary.

## Standard codes

| Code | Name | Meaning |
|---|---|---|
| `0` | Success | Command completed without error. |
| `1` | General failure | Command failed due to a bug or unrecoverable runtime error. |
| `64` | Feature unavailable | Feature is not enabled in this build — e.g., an experimental command that requires `anvil@experimental`. Callers and scripts should treat this as "not installed / gated", not as a program crash. |

## Notes

### Code 64 — feature unavailable / gated

Code 64 is used at stub-gate sites where a command exists in the default build solely
to emit a helpful message, but the real implementation lives in the experimental build:

```
anvil catalog …   →  64  (experimental, requires anvil@experimental)
anvil note …      →  64  (experimental, requires anvil@experimental)
anvil notepad …   →  64  (experimental, requires anvil@experimental)
```

The same code is emitted by experimental extension commands when the registry is
unreadable at startup (a prerequisite failure, not a user error).

The value 64 sits in the BSD `sysexits.h` range (64–78). Strictly, `EX_USAGE = 64`
means "command line usage error"; Anvil reuses the number in the broader "this
invocation cannot proceed because the feature is unavailable" sense.
`EX_UNAVAILABLE = 69` is closer in semantics but less commonly handled by scripts;
Anvil standardizes on 64 for ecosystem familiarity. Scripts that need to distinguish
"feature not installed" from "command crashed" should test `$? -eq 64`.

### Code 1 — general failure

Reserved for unexpected runtime errors and internal assertion failures. If a command
exits 1, it is a bug or misconfiguration, not an expected gating condition.

## Out of scope

This document covers only the `anvil` binary. Sub-process exit codes (e.g., hooks
invoked by Claude Code, spawn helpers in scripts/dev/) follow their own conventions
and are documented in-line.
