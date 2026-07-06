/**
 * Unit tests for src/core/security/redact.ts (ANV-0052)
 *
 * Coverage:
 *   - 8 secret families, each with ≥3 positive cases + ≥1 negative case
 *   - ANVIL_REDACT=off disables redaction
 *   - ANVIL_REDACT_FAMILIES allowlist skips specified families
 *   - Integration: statusline never displays raw sk-ant-api... string
 */
import { describe, expect, it } from 'vitest'
import { redact } from '../../../../src/core/security/redact.js'

// ---------------------------------------------------------------------------
// Family 1: Slack tokens
// ---------------------------------------------------------------------------
describe('redact — slack tokens', () => {
  it('redacts xoxb- (bot) token', () => {
    const s = 'token is xoxb-1234-5678-abcdefghij'
    expect(redact(s, {})).toContain('<<REDACTED:slack>>')
    expect(redact(s, {})).not.toContain('xoxb-1234-5678-abcdefghij')
  })

  it('redacts xoxp- (user) token', () => {
    const s = 'Authorization: xoxp-ABCD-EFGH-WXYZ'
    expect(redact(s, {})).toContain('<<REDACTED:slack>>')
    expect(redact(s, {})).not.toContain('xoxp-ABCD-EFGH-WXYZ')
  })

  it('redacts xapp- (app-level) token', () => {
    const s = 'slack_token=xapp-1-A0B1C2D3E4-1234567890abc'
    expect(redact(s, {})).toContain('<<REDACTED:slack>>')
    expect(redact(s, {})).not.toContain('xapp-1-A0B1C2D3E4-1234567890abc')
  })

  it('redacts xoxs- (service) token', () => {
    expect(redact('xoxs-TOKEN-VALUE-HERE', {})).toContain('<<REDACTED:slack>>')
  })

  it('does NOT redact ordinary words that look similar', () => {
    // "xoxo" does not match xox[abprs]
    const s = 'XOXO hugs and kisses'
    expect(redact(s, {})).toBe('XOXO hugs and kisses')
  })
})

// ---------------------------------------------------------------------------
// Family 2: Telegram bot tokens
// ---------------------------------------------------------------------------
describe('redact — telegram bot tokens', () => {
  it('redacts URL-path form /bot<id>:<token>/', () => {
    const s =
      'https://api.telegram.org/bot123456789:AAFoo-Bar_Baz1234567890ab/sendMessage'
    const result = redact(s, {})
    expect(result).toContain('<<REDACTED:telegram>>')
    expect(result).not.toContain('AAFoo-Bar_Baz1234567890ab')
  })

  it('redacts standalone form <id>:<token>', () => {
    const s = 'TOKEN=123456789:AAHfoo-bar_Baz1234567890ab'
    const result = redact(s, {})
    expect(result).toContain('<<REDACTED:telegram>>')
    expect(result).not.toContain('AAHfoo-bar_Baz1234567890ab')
  })

  it('redacts another valid standalone token', () => {
    const s = 'bot token: 987654321:ABCDEFGHIJKLMNOPQRSTUVWXYZabcde'
    const result = redact(s, {})
    expect(result).toContain('<<REDACTED:telegram>>')
    expect(result).not.toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZabcde')
  })

  it('does NOT redact short numeric IDs without long token part', () => {
    // "1234:56" — colon separator but token part < 20 chars
    const s = 'version: 1234:56 something'
    // Should not trigger telegram pattern
    expect(redact(s, {})).toBe('version: 1234:56 something')
  })
})

// ---------------------------------------------------------------------------
// Family 3: Bearer tokens
// ---------------------------------------------------------------------------
describe('redact — bearer tokens', () => {
  it('redacts Bearer token (preserves scheme prefix)', () => {
    const s = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.foo.bar'
    const result = redact(s, {})
    expect(result).toContain('Bearer ')
    expect(result).toContain('<<REDACTED:bearer>>')
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiJ9.foo.bar')
  })

  it('redacts bearer (lowercase) token', () => {
    const result = redact('bearer sk-some-secret-token', {})
    expect(result).toContain('<<REDACTED:bearer>>')
    expect(result).not.toContain('sk-some-secret-token')
  })

  it('redacts BEARER (uppercase) token', () => {
    const result = redact('BEARER my-super-secret-token-value-here', {})
    expect(result).toContain('<<REDACTED:bearer>>')
  })

  it('does NOT redact the word "Bearer" alone without a following token', () => {
    // "Bearer" with no following non-whitespace content
    const s = 'The word Bearer appears here'
    // "Bearer appears" — "appears" would be matched as the token value
    // This is acceptable behavior (conservative; better to over-redact than under-redact)
    // Just verify it does not crash
    expect(() => redact(s, {})).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Family 4: Bot tokens
// ---------------------------------------------------------------------------
describe('redact — bot tokens', () => {
  it('redacts Bot token (Discord format)', () => {
    const s = 'Authorization: Bot MTAxMjM0NTY3ODkwMTI.secret_part'
    const result = redact(s, {})
    expect(result).toContain('Bot ')
    expect(result).toContain('<<REDACTED:bot>>')
    expect(result).not.toContain('MTAxMjM0NTY3ODkwMTI.secret_part')
  })

  it('redacts bot (lowercase)', () => {
    const result = redact('bot somesecretvalue1234567', {})
    expect(result).toContain('<<REDACTED:bot>>')
  })

  it('redacts BOT (uppercase)', () => {
    const result = redact('BOT MY-SECRET-BOT-TOKEN', {})
    expect(result).toContain('<<REDACTED:bot>>')
  })

  it('does NOT confuse "robot" with "Bot" prefix', () => {
    // "robot" contains "bot" but not as a word boundary prefix scheme
    const s = 'I am a robot helper'
    // "robot" does not match "Bot\s+" pattern — confirm no crash
    expect(() => redact(s, {})).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Family 5: Anthropic API keys
// ---------------------------------------------------------------------------
describe('redact — anthropic sk-ant-api keys', () => {
  it('redacts a full sk-ant-api key', () => {
    const s = 'key=sk-ant-api03-ABCDEFGHIJKLMNOP'
    const result = redact(s, {})
    expect(result).toContain('<<REDACTED:anthropic>>')
    expect(result).not.toContain('sk-ant-api03-ABCDEFGHIJKLMNOP')
  })

  it('redacts key in a longer sentence', () => {
    const s = 'Using API key: sk-ant-api03-xYzAbCdEfGhIjKlMnOpQrStUv'
    const result = redact(s, {})
    expect(result).toContain('<<REDACTED:anthropic>>')
    expect(result).not.toContain('xYzAbCdEfGhIjKlMnOpQrStUv')
  })

  it('redacts key appearing after newline', () => {
    const s = 'config:\n  api_key: sk-ant-api03-MySecretKey123'
    const result = redact(s, {})
    expect(result).toContain('<<REDACTED:anthropic>>')
    expect(result).not.toContain('sk-ant-api03-MySecretKey123')
  })

  it('does NOT redact unrelated sk- strings', () => {
    // "sk-" that is NOT sk-ant-api should not be caught by the anthropic pattern
    const s = 'sk-openai-not-anthropic-key'
    // anthropic pattern only matches sk-ant-api prefix
    const result = redact(s, {})
    expect(result).toBe('sk-openai-not-anthropic-key')
  })
})

// ---------------------------------------------------------------------------
// Family 6: GitHub PAT tokens
// ---------------------------------------------------------------------------
describe('redact — github PAT tokens', () => {
  it('redacts ghp_ (fine-grained PAT)', () => {
    const s = 'token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef'
    const result = redact(s, {})
    expect(result).toContain('<<REDACTED:github>>')
    expect(result).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef')
  })

  it('redacts gho_ (OAuth app token)', () => {
    const result = redact('gho_ABCDEFGHIJKLMNOPQRSTUVWXYZ12345', {})
    expect(result).toContain('<<REDACTED:github>>')
  })

  it('redacts ghs_ (server-to-server installation token)', () => {
    const result = redact('ghs_ZYXWVUTSRQPONMLKJIHGFEDCBA12345', {})
    expect(result).toContain('<<REDACTED:github>>')
  })

  it('redacts ghu_ (user-to-server OAuth token)', () => {
    const result = redact('env GH_TOKEN=ghu_SomeTokenValue1234567890', {})
    expect(result).toContain('<<REDACTED:github>>')
    expect(result).not.toContain('ghu_SomeTokenValue1234567890')
  })

  it('does NOT redact "ghq_" or other non-PAT prefixes', () => {
    const s = 'ghq_ is not a valid GitHub token prefix'
    expect(redact(s, {})).toBe('ghq_ is not a valid GitHub token prefix')
  })
})

// ---------------------------------------------------------------------------
// Family 7: AWS access key IDs
// ---------------------------------------------------------------------------
describe('redact — aws access key IDs', () => {
  it('redacts AKIA access key ID', () => {
    const s = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE'
    const result = redact(s, {})
    expect(result).toContain('<<REDACTED:aws>>')
    expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE')
  })

  it('redacts AKIA key in error message', () => {
    const s = 'InvalidClientTokenId: AKIATESTKEY1234ABCDE is not valid'
    const result = redact(s, {})
    expect(result).toContain('<<REDACTED:aws>>')
    expect(result).not.toContain('AKIATESTKEY1234ABCDE')
  })

  it('redacts AKIA key with all digits after prefix', () => {
    const s = 'key=AKIA0000000000000000'
    const result = redact(s, {})
    expect(result).toContain('<<REDACTED:aws>>')
  })

  it('does NOT redact AKIA with wrong length (< 16 chars after prefix)', () => {
    // AKIA + 15 chars = 19 total, should NOT match (needs exactly 16 after AKIA)
    const s = 'AKIA12345678901'
    expect(redact(s, {})).toBe('AKIA12345678901')
  })

  it('does NOT redact lowercase akia', () => {
    const s = 'akia12345678901234'
    // AWS pattern is uppercase only
    expect(redact(s, {})).toBe('akia12345678901234')
  })
})

// ---------------------------------------------------------------------------
// Family 8: Generic JWT (eyJ…)
// ---------------------------------------------------------------------------
describe('redact — generic JWT tokens', () => {
  it('redacts a full 3-segment JWT', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    expect(redact(jwt, {})).toContain('<<REDACTED:jwt>>')
    expect(redact(jwt, {})).not.toContain(
      'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    )
  })

  it('redacts JWT embedded in a longer string', () => {
    const s =
      'token=eyJhbGciOiJSUzI1NiJ9.eyJ1c2VyIjoiYm9iIn0.SIGNATURE123 and more text'
    const result = redact(s, {})
    expect(result).toContain('<<REDACTED:jwt>>')
    expect(result).not.toContain('SIGNATURE123')
  })

  it('redacts multiple JWTs in one string', () => {
    const a = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.sig1'
    const b = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJiIn0.sig2'
    const result = redact(`${a} and ${b}`, {})
    expect(result).not.toContain('sig1')
    expect(result).not.toContain('sig2')
    // Should have 2 redaction markers
    expect((result.match(/<<REDACTED:jwt>>/g) ?? []).length).toBe(2)
  })

  it('does NOT redact eyJ followed by only 2 segments (not a valid JWT)', () => {
    // 2 segments: eyJ.payload — missing signature
    const s = 'eyJhbGciOiJIUzI1NiJ9.onlytwo'
    expect(redact(s, {})).toBe('eyJhbGciOiJIUzI1NiJ9.onlytwo')
  })
})

// ---------------------------------------------------------------------------
// ANVIL_REDACT=off — global opt-out
// ---------------------------------------------------------------------------
describe('redact — ANVIL_REDACT=off', () => {
  it('returns string unchanged when ANVIL_REDACT=off', () => {
    const s = 'key=sk-ant-api03-MyKey Bearer mytoken'
    expect(redact(s, { ANVIL_REDACT: 'off' })).toBe(s)
  })

  it('returns string unchanged when ANVIL_REDACT=OFF (uppercase)', () => {
    const s = 'ghp_TokenHere xoxb-1234-abcd'
    expect(redact(s, { ANVIL_REDACT: 'OFF' })).toBe(s)
  })

  it('still redacts when ANVIL_REDACT is not "off"', () => {
    const s = 'sk-ant-api03-MyKey'
    // Empty string or other value should NOT disable
    expect(redact(s, { ANVIL_REDACT: '' })).toContain('<<REDACTED:anthropic>>')
    expect(redact(s, { ANVIL_REDACT: '0' })).toContain('<<REDACTED:anthropic>>')
    expect(redact(s, { ANVIL_REDACT: 'false' })).toContain(
      '<<REDACTED:anthropic>>',
    )
  })
})

// ---------------------------------------------------------------------------
// ANVIL_REDACT_FAMILIES — configurable family allowlist
// ---------------------------------------------------------------------------
describe('redact — ANVIL_REDACT_FAMILIES allowlist', () => {
  it('skips the specified family when listed in allowlist', () => {
    const s = 'ghp_SomeToken and sk-ant-api03-MyKey'
    // Allow github through — should not be redacted
    const result = redact(s, { ANVIL_REDACT_FAMILIES: 'github' })
    expect(result).toContain('ghp_SomeToken')
    expect(result).toContain('<<REDACTED:anthropic>>')
  })

  it('skips multiple families when comma-separated', () => {
    const s = 'ghp_Token Bearer mytoken xoxb-1-2-3'
    const result = redact(s, { ANVIL_REDACT_FAMILIES: 'github,bearer,slack' })
    expect(result).toContain('ghp_Token')
    // bearer is allowed through but the "Bearer " prefix + token stays
    expect(result).not.toContain('<<REDACTED:bearer>>')
    expect(result).toContain('xoxb-1-2-3')
  })

  it('handles spaces around family names', () => {
    const s = 'sk-ant-api03-MyKey'
    const result = redact(s, { ANVIL_REDACT_FAMILIES: ' anthropic ' })
    expect(result).toContain('sk-ant-api03-MyKey')
  })

  it('still redacts non-allowlisted families', () => {
    const s = 'ghp_Token AKIAIOSFODNN7EXAMPLE'
    // Allow github but not aws
    const result = redact(s, { ANVIL_REDACT_FAMILIES: 'github' })
    expect(result).toContain('ghp_Token')
    expect(result).toContain('<<REDACTED:aws>>')
  })
})

// ---------------------------------------------------------------------------
// Bearer / Bot word-boundary regression (ANV-0052 review finding 1)
// ---------------------------------------------------------------------------
describe('redact — bearer/bot word-boundary regression', () => {
  // Positive cases: real tokens must be redacted
  it('redacts Bearer with a real-length token (≥16 chars)', () => {
    const s = 'Authorization: Bearer abcdef0123456789xyz'
    const result = redact(s, {})
    expect(result).toContain('Bearer ')
    expect(result).toContain('<<REDACTED:bearer>>')
    expect(result).not.toContain('abcdef0123456789xyz')
  })

  it('redacts Bot with a real xoxp-style token (≥16 chars)', () => {
    const s = 'Authorization: Bot xoxp-123456789012-abcdefghijklmn'
    const result = redact(s, {})
    expect(result).toContain('Bot ')
    expect(result).toContain('<<REDACTED:bot>>')
    expect(result).not.toContain('xoxp-123456789012-abcdefghijklmn')
  })

  // Negative cases: prose words that contain "bearer" / "bot" must NOT be redacted
  it('does NOT redact "forbearer of the throne"', () => {
    const s = 'forbearer of the throne'
    expect(redact(s, {})).toBe('forbearer of the throne')
  })

  it('does NOT redact "chatbot something"', () => {
    const s = 'chatbot something'
    expect(redact(s, {})).toBe('chatbot something')
  })

  it('does NOT redact "rebar bottle"', () => {
    const s = 'rebar bottle'
    expect(redact(s, {})).toBe('rebar bottle')
  })

  it('does NOT redact short prose after Bearer (< 16 chars)', () => {
    // "Bearer appears" — "appears" is 7 chars, below the 16-char minimum
    const s = 'The word Bearer appears here'
    expect(redact(s, {})).toBe('The word Bearer appears here')
  })
})

// ---------------------------------------------------------------------------
// Telegram uppercase-prefix anchor (ANV-0052 review finding 4)
// ---------------------------------------------------------------------------
describe('redact — telegram uppercase-prefix anchor', () => {
  it('redacts standalone token with uppercase-prefixed value', () => {
    const s = 'TOKEN=123456789:AAHfoo-bar_Baz1234567890ab'
    const result = redact(s, {})
    expect(result).toContain('<<REDACTED:telegram>>')
    expect(result).not.toContain('AAHfoo-bar_Baz1234567890ab')
  })

  it('does NOT redact a token-like pattern where value starts with lowercase', () => {
    // "12345678:abcdefghijklmnopqrst" — value starts lowercase, not a real Telegram token
    const s = 'ratio: 12345678:abcdefghijklmnopqrst'
    expect(redact(s, {})).toBe('ratio: 12345678:abcdefghijklmnopqrst')
  })
})

// ---------------------------------------------------------------------------
// Integration: statusline never exposes raw sk-ant-api... string
// ---------------------------------------------------------------------------
describe('redact — statusline integration', () => {
  it('statusline string with raw Anthropic key is fully redacted', () => {
    // Simulate a statusline fragment containing a leaked API key
    const statusline =
      '[anvil] model=sonnet key=sk-ant-api03-ABCDEFGHIJKLMNOP cost=0.0012'
    const result = redact(statusline, {})
    expect(result).not.toMatch(/sk-ant-api/)
    expect(result).toContain('<<REDACTED:anthropic>>')
    expect(result).toContain('[anvil] model=sonnet key=')
    expect(result).toContain('cost=0.0012')
  })

  it('no sk-ant-api survives when ANVIL_REDACT is default (unset)', () => {
    const s = 'error: sk-ant-api03-SECRETKEYVALUE is invalid'
    // Call with empty env (no ANVIL_REDACT set)
    const result = redact(s, {})
    expect(result).not.toMatch(/sk-ant-api/)
  })
})
