# Comment Analyzer — sub-task prompt

> **Dispatch pattern:** `Task(general-purpose)` with this prompt body. Read-only
> sub-task spawned by the `code-review` skill when reviewing comments for
> staleness, AI-slop, or contradictions. Catches semantic issues that
> regex-grade lint cannot reach.

## Status: comment-analyzer starting — read-only inspection of code comments; emitting ReviewReport JSON

**Announce:** I am inspecting code comments for staleness, AI-slop, or contradictions with adjacent identifiers.

## What this sub-task does

Walks the supplied file or directory; reads each source file once; identifies comments that fall into one of three categories:

1. **Staleness.** The comment describes behavior that is no longer present in the code below it (renamed identifier, removed branch, changed return shape, fixed bug whose comment still warns about it).
2. **Contradiction.** The comment makes a claim that the immediately adjacent code refutes (e.g. "returns null on miss" above a function that throws; "validated upstream" above a path with no validation; a "to-do: handle X" marker still present after the case has been handled).
3. **AI-slop.** The comment over-explains the obvious, hedges without information ("this is needed because"), restates the function name in prose, or uses sycophantic / motivational tone. Regex-grade lint catches lexical patterns; this sub-task catches the semantic ones that regex cannot reach.

Output is a `ReviewReport` JSON object. Each finding carries `severity` (info / warn / error per project convention), `category` (`comment-stale` | `comment-contradiction` | `comment-ai-slop`), `file`, `line`, the verbatim comment text, and a one-line `suggestion` (rewrite or delete).

## Out of scope

- **Editing.** This sub-task is strictly read-only. Findings are emitted; the caller decides whether to apply suggestions.
- **Architectural review.** Inferring whether a function should exist at all is the `code-review` skill's job, not this sub-task's.
- **Style nits below the comment level.** Indentation, naming, line length, etc. — defer to project linters.
- **Cross-file inference.** A comment that contradicts code in a different file is out of scope; only the immediately surrounding code (±50 lines, same file) is in-scope evidence.

## Do NOT flag

The following kinds of comments are legitimate — never report them as findings:

- **License headers and copyright notices.** Always preserve.
- **ADR-style rationale** that explains *why* a non-obvious choice was made (a workaround, a deliberate trade-off, a reference to an issue or RFC). The whole point of these is to encode information that isn't in the code.
- **Domain-specific comments** that name a regulation, protocol, RFC, or standards document and explain how the code complies.
- **Public API docs** (JSDoc, docstrings, doc comments) on exported symbols, even if they restate the function name — public documentation has different rules from inline narration.
- **`SAFETY:` / `INVARIANT:` / `WARNING:` markers** that name a hidden constraint or precondition. These are load-bearing.
- **Owned to-do markers** with explicit ownership (the parenthesized `<owner>` / `<plan-id>` / `<issue>` form). Lint tooling already catches the unversioned variant; do not double-flag.
- **Test descriptions inside test files.** `// Arrange / Act / Assert` and similar test-structure markers belong.
- **Comments that quote external systems verbatim** (error messages, schema fields, API responses).

When in doubt, prefer no-finding. False positives erode trust faster than missed slop.

## Loop

1. **Read the project's CLAUDE.md** and any per-folder CLAUDE.md files relevant to the changed code.
2. **Glob** the target paths (default: caller-supplied; fallback: `**/*.{ts,tsx,js,jsx,py,go,rs,java,kt,php,rb,swift,cpp,cs}`). Skip `node_modules/`, `dist/`, `build/`, `.git/`, vendored / generated directories.
3. For each candidate file:
   a. **Read** the file once.
   b. Walk top-to-bottom; for every comment block (line `//`, block `/* */`, doc `/** */`, hash `#`, etc.), capture: comment text, file, line, the next ≤20 lines of code (the "subject" the comment is attached to).
   c. For each comment, run the three-category check. Skip comments that match a "do NOT flag" rule.
   d. Append findings to the in-memory list with confidence scoring per the rubric below.
4. **Filter** findings by `min_confidence` (default 80). Drop anything below.
5. **Emit** the `ReviewReport` JSON.

## Confidence rubric

- **High (≥90).** The comment makes an explicit factual claim that the immediately following code clearly refutes (named function returns X; comment says Y; X ≠ Y).
- **Medium (80–89).** The comment is non-trivially redundant with the code below (the comment's only information content is the function name spelled in English).
- **Low (<80).** Style preference, hedging, or a guess. Drop — do not report.

## Verification

Before emitting, sanity-check each finding:
- Does the verbatim comment text appear in the file at the reported line? If not, the line numbering is off — recompute.
- Did the suggestion preserve any load-bearing information from the comment? If the suggestion is "delete", confirm the comment carries no `SAFETY:` / `INVARIANT:` / `WARNING:` markers and no owned to-do (the parenthesized-`<owner>` form).
- For the `ai-slop` category specifically: would removing the comment leave a future reader with any new question? If yes, downgrade to no-finding.

Confirm this sub-task's findings do not duplicate the exact lexical patterns that a regex-grade lint pass would catch — regex patterns belong to the linter; this sub-task emits only the semantic findings that regex cannot reach.

## Output

A `ReviewReport` JSON object. The `findings` array is sorted by `severity` desc, then `file` asc, then `line` asc. Empty findings list = no issues.

## Status: comment-analyzer done — ReviewReport emitted; status: DONE
