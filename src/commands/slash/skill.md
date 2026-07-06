---
name: skill
description: Activate a named skill explicitly
argument-hint: <name>
---

Invoke the named skill directly.

Bypasses skill-selection; useful when you know exactly which skill you want.

Accepts bare `<slug>` or qualified `<pack>:<slug>` (ANV-0096). The bundled
namespace is `anvil`, so `anvil:code-review` is equivalent to bare
`code-review` when no third-party pack collides.

## Equivalent CLI

`anvil skill run <name>`

`anvil skill list --pack <pack>` filters the listing to a single pack.
