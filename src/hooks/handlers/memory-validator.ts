/**
 * memory-validator PreToolUse handler (ANV-0125).
 *
 * Verifies structural invariants on `CLAUDE.md` / `AGENTS.md` edits BEFORE
 * they hit disk, denying the edit (exit 2) when an invariant would be
 * violated. The actual invariant logic lives in
 * `src/core/validation/memory-file.ts` (pure, layer 0); this handler is
 * a thin shim that:
 *
 *   1. Extracts the target path from the PreToolUse payload.
 *   2. Computes the proposed post-edit content for Edit / Write / MultiEdit.
 *   3. Calls `detectInvariantViolations` and translates the result into
 *      a `HookResult`.
 *
 * ## Bypass: `--allow-restructure`
 *
 * Setting `ANVIL_ALLOW_RESTRUCTURE=1` in the environment (or passing
 * `allow_restructure: true` on the payload) bypasses all checks for that
 * invocation. The bypass is logged to stderr so it is auditable.
 *
 * ## Tool support
 *
 * Edit and Write are fully supported. MultiEdit is checked iteratively
 * by applying each `edits[]` entry in order, mirroring the tool semantics.
 *
 * ## Failure modes
 *
 * The handler never throws — file-read errors, malformed payloads, and
 * unrelated tool kinds all return a benign allow result (exit 0).
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import type {
  HookHandler,
  HookHandlerProfileManifest,
  HookResult,
} from '../../core/types.js'
import {
  type MemoryFileProfile,
  detectInvariantViolations,
  formatViolations,
  isClaudeMd,
  isMemoryFile,
} from '../../core/validation/memory-file.js'

// ─── Payload schema ──────────────────────────────────────────────────────────

const EditInput = z
  .object({
    file_path: z.string().optional(),
    path: z.string().optional(),
    old_string: z.string().optional(),
    new_string: z.string().optional(),
    replace_all: z.boolean().optional(),
  })
  .passthrough()

const WriteInput = z
  .object({
    file_path: z.string().optional(),
    path: z.string().optional(),
    content: z.string().optional(),
  })
  .passthrough()

const MultiEditInput = z
  .object({
    file_path: z.string().optional(),
    edits: z
      .array(
        z
          .object({
            old_string: z.string().optional(),
            new_string: z.string().optional(),
            replace_all: z.boolean().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough()

const PreToolUsePayload = z
  .object({
    tool_name: z.string().optional(),
    tool: z.string().optional(),
    tool_input: z.unknown().optional(),
    allow_restructure: z.boolean().optional(),
  })
  .passthrough()

type ParsedPayload = z.infer<typeof PreToolUsePayload>

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ALLOW: HookResult = { exitCode: 0 }

function parsePayload(payload: unknown): ParsedPayload | null {
  const result = PreToolUsePayload.safeParse(payload)
  return result.success ? result.data : null
}

function readOldContent(absPath: string): string {
  try {
    if (!existsSync(absPath)) return ''
    return readFileSync(absPath, 'utf8')
  } catch {
    return ''
  }
}

function siblingAgentsMdExists(absPath: string): boolean {
  const dir = dirname(absPath)
  return existsSync(join(dir, 'AGENTS.md'))
}

/**
 * Apply a single Edit-tool change to `source`.
 *
 * Mirrors the CC Edit semantics: replace `old_string` with `new_string`.
 * When `replace_all` is true, every occurrence is replaced; otherwise only
 * the first.
 *
 * When `old_string` is empty (Write-style new file) the entire body is
 * replaced with `new_string`.
 */
function applyEdit(
  source: string,
  oldStr: string,
  newStr: string,
  replaceAll: boolean,
): string {
  if (oldStr === '') return newStr
  if (replaceAll) return source.split(oldStr).join(newStr)
  const idx = source.indexOf(oldStr)
  if (idx === -1) return source
  return source.slice(0, idx) + newStr + source.slice(idx + oldStr.length)
}

interface ProposedEdit {
  /** Absolute or repo-relative path. */
  filePath: string
  /** Proposed post-edit content. */
  newContent: string
  /** Pre-existing file content (empty if file did not exist). */
  oldContent: string
}

/**
 * Compute proposed post-edit content from the tool input. Returns null
 * when the tool is unsupported / payload malformed / file_path absent.
 */
function computeProposedEdit(parsed: ParsedPayload): ProposedEdit | null {
  const toolName = parsed.tool_name ?? parsed.tool ?? ''
  if (!toolName) return null

  if (toolName === 'Edit') {
    const input = EditInput.safeParse(parsed.tool_input)
    if (!input.success) return null
    const filePath = input.data.file_path ?? input.data.path
    if (!filePath) return null
    const oldContent = readOldContent(filePath)
    const newContent = applyEdit(
      oldContent,
      input.data.old_string ?? '',
      input.data.new_string ?? '',
      input.data.replace_all ?? false,
    )
    return { filePath, oldContent, newContent }
  }

  if (toolName === 'Write') {
    const input = WriteInput.safeParse(parsed.tool_input)
    if (!input.success) return null
    const filePath = input.data.file_path ?? input.data.path
    if (!filePath) return null
    const oldContent = readOldContent(filePath)
    return {
      filePath,
      oldContent,
      newContent: input.data.content ?? '',
    }
  }

  if (toolName === 'MultiEdit') {
    const input = MultiEditInput.safeParse(parsed.tool_input)
    if (!input.success) return null
    const filePath = input.data.file_path
    if (!filePath) return null
    const oldContent = readOldContent(filePath)
    let current = oldContent
    for (const edit of input.data.edits ?? []) {
      current = applyEdit(
        current,
        edit.old_string ?? '',
        edit.new_string ?? '',
        edit.replace_all ?? false,
      )
    }
    return { filePath, oldContent, newContent: current }
  }

  return null
}

function bypassActive(
  parsed: ParsedPayload,
  env: Record<string, string>,
): boolean {
  if (parsed.allow_restructure === true) return true
  if (env.ANVIL_ALLOW_RESTRUCTURE === '1') return true
  if (process.env.ANVIL_ALLOW_RESTRUCTURE === '1') return true
  return false
}

// ─── Profile manifest (ANV-0128) ─────────────────────────────────────────────

/**
 * ANV-0128 — memory-validator profile manifest.
 *
 * The validator's three operating modes:
 *
 *   minimal  — only H1 presence is enforced (lean docs-in-flux mode).
 *   balanced — DEFAULT. Full invariant set (stub-parity, table headings,
 *              H1 presence, H1 rename advisory). Identical to pre-ANV-0128
 *              behavior so existing installs see no change.
 *   strict   — `balanced` plus rejects newly-introduced trailing whitespace.
 *
 * Selectable per project via `anvil.config.json`:
 *
 *     "hooks": { "memory-validator": { "profile": "strict" } }
 */
export const memoryValidatorProfileManifest: HookHandlerProfileManifest = {
  profiles: {
    minimal: {
      description: 'H1 presence only — stub/table/h1-rename checks skipped.',
    },
    balanced: {
      description:
        'Full invariant set (default): H1, stub-parity, table headings, H1 rename.',
    },
    strict: {
      description: 'Balanced + reject newly-introduced trailing whitespace.',
    },
  },
  defaultProfile: 'balanced',
}

const VALID_PROFILES: ReadonlySet<MemoryFileProfile> = new Set([
  'minimal',
  'balanced',
  'strict',
])

function normaliseProfile(raw: string | undefined): MemoryFileProfile {
  if (raw && (VALID_PROFILES as Set<string>).has(raw)) {
    return raw as MemoryFileProfile
  }
  return 'balanced'
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const memoryValidatorHandler: HookHandler = async (ctx) => {
  const parsed = parsePayload(ctx.payload)
  if (!parsed) return ALLOW

  const proposed = computeProposedEdit(parsed)
  if (!proposed) return ALLOW

  if (!isMemoryFile(proposed.filePath)) return ALLOW

  if (bypassActive(parsed, ctx.env)) {
    const msg = `memory-validator: ANVIL_ALLOW_RESTRUCTURE active — invariant checks skipped for ${proposed.filePath}.`
    process.stderr.write(`[anvil:memory-validator] ${msg}\n`)
    return {
      exitCode: 0,
      message: msg,
      context: {
        filePath: proposed.filePath,
        bypassed: true,
      },
    }
  }

  const sibling = isClaudeMd(proposed.filePath)
    ? siblingAgentsMdExists(proposed.filePath)
    : true

  // ANV-0128 — read the active profile from the dispatcher-supplied context.
  // Undefined / unrecognised profile names fall back to `balanced` so
  // legacy callers (no manifest attached) preserve pre-ANV-0128 behavior.
  const profile = normaliseProfile(ctx.profile)

  const violations = detectInvariantViolations({
    path: proposed.filePath,
    oldContent: proposed.oldContent,
    newContent: proposed.newContent,
    siblingAgentsMdExists: sibling,
    profile,
  })

  if (violations.length === 0) {
    return {
      exitCode: 0,
      message: `memory-validator[${profile}]: ${proposed.filePath} — invariants OK.`,
      context: {
        filePath: proposed.filePath,
        memoryValidatorPassed: true,
        profile,
      },
    }
  }

  return {
    exitCode: 2,
    message: formatViolations(proposed.filePath, violations),
    context: {
      filePath: proposed.filePath,
      memoryValidatorBlocked: true,
      violationCount: violations.length,
      violationKinds: violations.map((v) => v.kind),
      profile,
    },
  }
}
