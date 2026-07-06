# src/tui/ — AI Developer Notes

Layer 6. TUI installer using `@clack/prompts`.

## Files

- `installer.ts` — main flow: welcome → target → scope → languages → bundles → hooks → models → preview → execute.
- `screens/*.ts` — one file per screen. Each exports a `runScreen(ctx): Promise<ScreenResult>` function.
- `components/` — reusable widgets built on `@clack/prompts` primitives (color-coded model tags, etc.).

## Rules

- Screens contain no business logic. They collect input, validate it locally, return a result.
- All "what to install" decisions go through `src/installer/`, not the TUI.
- Never call adapters directly from a screen.
