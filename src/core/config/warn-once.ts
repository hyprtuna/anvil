const warned = new Set<string>()

const MAX_SOURCE_LEN = 240

export function warnConfigInvalidOnce(
  absPath: string,
  source: string,
  kind: string,
): void {
  if (warned.has(absPath)) return
  warned.add(absPath)
  const truncated =
    source.length > MAX_SOURCE_LEN ? source.slice(0, MAX_SOURCE_LEN) : source
  process.stderr.write(
    `anvil hook ${kind}: ${absPath} invalid (${truncated}); feature disabled\n`,
  )
}
