---
name: anvil-init
description: Initialize Anvil in the current project
argument-hint: "[--target both|claude-code|opencode] [--scope project|global] [--preset balanced|cost-optimised|max-quality|speed-first] [--statusline] [--headless]"
---

Runs `anvil init` in the project directory.

Detects language/framework/test runner, presents preset choices, writes `.anvil/` and platform configs.

## Equivalent CLI

`anvil init`
