# hooks/ — AI Developer Notes

Compiled hook scripts (build output). Source lives in `src/hooks/handlers/`. This directory is populated by `npm run build`.

## Rules

- Do not hand-edit these files. Edit `src/hooks/handlers/*.ts` instead, rebuild, commit both.
- The adapter generators (`src/adapters/*/generate.ts`) reference these files by path when emitting platform manifests.
