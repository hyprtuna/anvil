/**
 * PostToolUse payload extraction for the edit accumulator (Plan 43 Phase H).
 *
 * Pure: derives session id, tool name, and the list of edited file paths
 * from a CC hook envelope. Returns empty for any non-Edit/Write/MultiEdit
 * tool name or malformed payload.
 */

export function getSessionId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as Record<string, unknown>
  return typeof p.session_id === 'string' ? p.session_id : null
}

export function getToolName(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as Record<string, unknown>
  if (typeof p.tool_name === 'string') return p.tool_name
  if (typeof p.tool === 'string') return p.tool
  return null
}

/**
 * Extract all edited file paths.
 *  - Edit / Write: reads `tool_input.file_path`.
 *  - MultiEdit: reads every `tool_input.edits[*].file_path`.
 */
export function extractEditedPaths(payload: unknown): string[] {
  if (typeof payload !== 'object' || payload === null) return []
  const p = payload as Record<string, unknown>
  const toolName = getToolName(p)
  if (!toolName) return []

  const input = (
    typeof p.tool_input === 'object' && p.tool_input !== null
      ? p.tool_input
      : {}
  ) as Record<string, unknown>

  if (toolName === 'Edit' || toolName === 'Write') {
    const fp = input.file_path
    return typeof fp === 'string' && fp.length > 0 ? [fp] : []
  }

  if (toolName === 'MultiEdit') {
    const edits = input.edits
    if (!Array.isArray(edits)) return []
    const paths: string[] = []
    for (const edit of edits) {
      if (
        typeof edit === 'object' &&
        edit !== null &&
        typeof (edit as Record<string, unknown>).file_path === 'string'
      ) {
        const fp = (edit as Record<string, unknown>).file_path as string
        if (fp.length > 0) paths.push(fp)
      }
    }
    return paths
  }

  return []
}
