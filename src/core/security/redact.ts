/**
 * Token Redaction Primitive (ANV-0052)
 *
 * Masks 8 families of sensitive tokens in strings before they reach any
 * user-visible output channel (statusline, transcript, log files).
 *
 * Controlled by:
 *   ANVIL_REDACT=off            — disables all redaction (default ON)
 *   ANVIL_REDACT_FAMILIES=a,b   — comma-separated allowlist of families to skip
 *                                  (i.e. families listed here are NOT redacted)
 *
 * No I/O. Pure string → string transformation. Layer 0 — no imports from
 * higher layers.
 */

/** The 8 supported secret families. */
export type RedactFamily =
  | 'slack'
  | 'telegram'
  | 'bearer'
  | 'bot'
  | 'anthropic'
  | 'github'
  | 'aws'
  | 'jwt'

interface FamilyPattern {
  family: RedactFamily
  /**
   * Patterns to apply for this family. Applied in order; each replaces the
   * full match with `<<REDACTED:family>>`.
   *
   * Optional `replace` callback: when present, it is called instead of the
   * default full-match replacement. The callback receives the full match and
   * all capture groups; it must return the replacement string. This avoids
   * brittle family-name string matching in the dispatch loop.
   */
  patterns: {
    re: RegExp
    replace?: (match: string, ...groups: string[]) => string
  }[]
}

/**
 * All 8 family patterns. Ordered by specificity (most-specific first) so
 * broader patterns don't swallow more precise ones in a single pass.
 *
 * Design notes per ticket:
 * - Slack: covers xox[abprs]-… variants (b=bot, p=user, a=app, r=refresh, s=service).
 *   xapp- tokens are also a Slack family variant; grouped here.
 * - Telegram: both standalone `<id>:<token>` form and URL-path `/bot<id>:<token>/` form.
 * - Bearer / Bot: HTTP Authorization header values (case-insensitive).
 * - Anthropic: `sk-ant-api` prefix — the full key.
 * - GitHub PAT: ghp_, gho_, ghu_, ghs_, ghr_ prefixes (all 5 variants).
 * - AWS: AKIA[A-Z0-9]{16} format access key IDs.
 * - JWT (family "jwt"): generic 3-segment base64url tokens starting with eyJ
 *   (covers OpenAI sk-…, Discord, Auth0, Clerk, Supabase anon keys, etc.).
 *   This is chosen over "generic URL credentials" because the eyJ pattern is
 *   unambiguous and the base64url grammar eliminates false positives on random
 *   text. URL credentials (user:pass@host) have far more false positives and
 *   are harder to regex safely without matching ISO timestamps etc.
 */
const FAMILY_PATTERNS: FamilyPattern[] = [
  {
    family: 'slack',
    patterns: [
      {
        // xoxb-, xoxp-, xoxa-, xoxr-, xoxs-, xapp- followed by token chars
        re: /\b(xox[abprs]|xapp)-[A-Za-z0-9-]+/g,
      },
    ],
  },
  {
    family: 'telegram',
    patterns: [
      {
        // URL path form: /bot123456789:AAF.../
        // Preserve /bot<id>: prefix; redact only the token portion.
        re: /\/bot(\d{6,12}):[A-Za-z0-9_-]{20,}/g,
        replace: (_match: string, id: string) =>
          `/bot${id}:<<REDACTED:telegram>>`,
      },
      {
        // Standalone form: 123456789:AAHfoo-bar_Baz (8-12 digit id : 20+ char token)
        // Token segment MUST start with an uppercase letter (real Telegram tokens
        // always start with 'AA' or a similar uppercase prefix) to avoid matching
        // ISO-like patterns such as "12345678:56".
        re: /\b(\d{8,12}):[A-Z][A-Za-z0-9_-]{19,}\b/g,
      },
    ],
  },
  {
    family: 'bearer',
    patterns: [
      {
        // "Bearer <token>" — the keyword must NOT be preceded by a letter
        // (blocks "forbearer", "subbearer", etc.) and the token value must be
        // ≥16 non-whitespace chars to avoid prose collisions like "Bearer appears".
        // Preserves the "Bearer " prefix; only the value is replaced.
        re: /(?<![A-Za-z])(Bearer)\s+(\S{16,})/gi,
        replace: (_match: string, keyword: string, _token: string) =>
          `${keyword} <<REDACTED:bearer>>`,
      },
    ],
  },
  {
    family: 'bot',
    patterns: [
      {
        // "Bot <token>" — same standalone-keyword constraint as Bearer above.
        // Blocks "chatbot something", "rebar bottle", etc.
        re: /(?<![A-Za-z])(Bot)\s+(\S{16,})/gi,
        replace: (_match: string, keyword: string, _token: string) =>
          `${keyword} <<REDACTED:bot>>`,
      },
    ],
  },
  {
    family: 'anthropic',
    patterns: [
      {
        // sk-ant-api… — Anthropic API key format
        re: /\b(sk-ant-api)[A-Za-z0-9_-]+/g,
      },
    ],
  },
  {
    family: 'github',
    patterns: [
      {
        // ghp_ (fine-grained PAT), gho_ (OAuth app), ghu_ (user-to-server),
        // ghs_ (server-to-server), ghr_ (refresh token)
        re: /\b(gh[pousr]_)[A-Za-z0-9]+/g,
      },
    ],
  },
  {
    family: 'aws',
    patterns: [
      {
        // AWS Access Key ID: AKIA followed by exactly 16 uppercase alphanumerics
        re: /\b(AKIA)[A-Z0-9]{16}\b/g,
      },
    ],
  },
  {
    family: 'jwt',
    patterns: [
      {
        // Generic JWT: 3 dot-separated base64url segments, first starting with eyJ
        // This covers OpenAI sk-… (as eyJ…), Auth0, Clerk, Supabase anon keys, etc.
        // Pattern: eyJ[base64url]+\.[base64url]+\.[base64url]+
        re: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      },
    ],
  },
]

/**
 * Parse the ANVIL_REDACT_FAMILIES environment variable into a Set of family
 * names that should be skipped (i.e. allowed through without redaction).
 *
 * Returns an empty set when the env var is absent or empty (default: redact all).
 */
function parseAllowlist(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const raw = env.ANVIL_REDACT_FAMILIES ?? ''
  if (!raw.trim()) return new Set()
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

/**
 * Redact sensitive tokens from a string.
 *
 * Each matched token is replaced with `<<REDACTED:family>>` where `family` is
 * the 8-family classification (slack / telegram / bearer / bot / anthropic /
 * github / aws / jwt).
 *
 * Controlled by environment variables:
 *   ANVIL_REDACT=off            — disables redaction entirely (returns s unchanged)
 *   ANVIL_REDACT_FAMILIES=a,b   — comma-separated family names to skip
 *
 * @param s  - The string to redact
 * @param env - Optional env override for testability (defaults to process.env)
 */
export function redact(
  s: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  // Global opt-out
  if ((env.ANVIL_REDACT ?? '').toLowerCase() === 'off') return s

  const allowlist = parseAllowlist(env)
  let result = s

  for (const { family, patterns } of FAMILY_PATTERNS) {
    // Skip families the caller has explicitly allowed through
    if (allowlist.has(family)) continue

    const replacement = `<<REDACTED:${family}>>`
    for (const { re, replace: replaceFn } of patterns) {
      // Reset lastIndex for global regexes (defensive — each pattern is created
      // as a literal so lastIndex starts at 0, but re-using a pattern across
      // multiple calls can leave a stale lastIndex).
      re.lastIndex = 0

      if (replaceFn !== undefined) {
        // Family-specific replacer attached to the pattern entry — dispatch
        // directly without any family-name string matching.
        result = result.replace(re, replaceFn as (...args: unknown[]) => string)
      } else {
        result = result.replace(re, replacement)
      }

      re.lastIndex = 0
    }
  }

  return result
}
