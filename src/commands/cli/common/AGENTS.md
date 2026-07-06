# src/commands/cli/common/ — AI Developer Notes

Shared helpers for every `anvil` subcommand. Layer 4 leaves.

## Files

- `json-mode.ts` — `maybeEmitJson(payload, opts)` returns `true` (and writes to stdout) when `--json` is set. Every subcommand calls this before its pretty-printed output.
- `output.ts` — success/warn/error formatters used by the non-JSON paths.

## Rules

- Pure and synchronous. No disk I/O, no process spawning, no network.
- Never import from sibling subcommands; these are leaves.
- When adding a new helper: export a pure function, write a unit test under `tests/unit/commands/cli/common/`, and keep the file under ~60 lines.
