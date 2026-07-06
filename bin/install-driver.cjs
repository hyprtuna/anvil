#!/usr/bin/env node
// Used by install.sh on first run (before ~/.anvil/ exists).
// Delegates to the compiled cli.js inside the repo clone.
import(
  require('node:path').join(__dirname, '..', 'dist', 'installer', 'cli.js')
).catch((e) => {
  console.error(e)
  process.exit(1)
})
