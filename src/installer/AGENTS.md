# src/installer/ — AI Developer Notes

Layer 7. Install/uninstall execution.

## Files

- `install.ts` — writes `.anvil/`, `.claude-plugin/`, `.opencode/`, hook scripts. Idempotent. Atomic (all-or-nothing per install run).
- `uninstall.ts` — reverses every operation from `install.ts`.
- `upgrade.ts` — diffs current state vs target, applies minimal changes.
- `verify.ts` — post-install sanity check; used by `anvil doctor`.

## Rules

- **Idempotent:** running `install` twice produces the same state. No duplicate entries, no drift.
- **Atomic:** on failure, roll back all writes from this run. Use a temp directory + rename pattern.
- **Reversible:** `uninstall` must be able to undo any install, including partial installs aborted mid-flight.
- Never silently overwrite user modifications. If a file has been locally edited (detected via hash comparison), prompt or abort.
