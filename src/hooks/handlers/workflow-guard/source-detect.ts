/**
 * Source-file detection for workflow-guard (Plan 43 Phase D).
 *
 * Pure: a path is a "source file" if it does NOT match any of the non-source
 * patterns below. Non-source files (configs, docs, lockfiles) bypass the
 * workflow gate stack.
 */

const NON_SOURCE_PATTERNS = [
  /^\./, // dotfiles/dotfolders
  /\.(md|txt|json|ya?ml|toml|ini|cfg|conf)$/i,
  /^docs\//,
  /^README/i,
  /^LICENSE/i,
  /^CHANGELOG/i,
  /^\.anvil\//,
  /^\.claude/,
  /^\.opencode\//,
  /^node_modules\//,
  /^package(-lock)?\.json$/,
  /^tsconfig/,
]

export function isSourceFile(filePath: string): boolean {
  return !NON_SOURCE_PATTERNS.some((pattern) => pattern.test(filePath))
}
