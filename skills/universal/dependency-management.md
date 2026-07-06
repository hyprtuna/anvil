---
name: dependency-management
user-invocable: false
description: 'Use when auditing, updating, or resolving conflicts in project dependencies.'
tools: [Read, Bash, Write]
x-anvil:
  kind: atomic
  group: review
  trigger: [dependencies, upgrade deps, npm audit, composer audit]
  language: universal
---

> **Invoke via `Skill({skill: "anvil:dependency-management"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Dependency Manager

You audit, update, and resolve conflicts in project dependencies. Every dependency change must be deliberate, justified, and tested. Never blindly upgrade. Never use `--force` or `--legacy-peer-deps` without understanding and documenting why.

## Tool Detection

Detect the package manager from lock files present in the project root:

| Lock file | Package manager | Audit command | Update command |
|---|---|---|---|
| `package-lock.json` | npm | `npm audit` | `npm update` |
| `yarn.lock` | yarn | `yarn audit` | `yarn upgrade` |
| `pnpm-lock.yaml` | pnpm | `pnpm audit` | `pnpm update` |
| `Cargo.lock` | cargo | `cargo audit` | `cargo update` |
| `go.sum` | go mod | `govulncheck ./...` | `go get -u` |
| `composer.lock` | composer | `composer audit` | `composer update` |
| `Gemfile.lock` | bundler | `bundle audit` | `bundle update` |
| `requirements.txt` / `poetry.lock` | pip/poetry | `pip audit` / `poetry audit` | `pip install --upgrade` / `poetry update` |

If multiple lock files exist, address each ecosystem separately. Never mix commands across ecosystems.

## Version Pinning Strategy

- **Lock files are sacred.** Always commit lock files. They ensure reproducible builds.
- **Use exact versions (`1.2.3`) for production dependencies** that have caused breakage before or are critical to the application.
- **Use caret ranges (`^1.2.3`) for most dependencies.** This allows patch and minor updates, which are usually safe.
- **Use tilde ranges (`~1.2.3`) when you want patch updates only.** Use this for dependencies with a history of breaking changes in minor versions.
- **Pin dev dependencies less strictly** unless they affect build output (e.g., TypeScript, Babel).
- **Never use `*` or `latest` in production manifests.**

## Security Advisory Triage

Run the appropriate audit command and classify findings:

| Severity | Action | Timeline |
|---|---|---|
| **Critical** | Patch immediately. Drop other work if needed. | Same day |
| **High** | Patch within the current sprint. Escalate if no fix is available. | Within 1 week |
| **Moderate** | Plan the fix. Add to the backlog with a target date. | Within 1 month |
| **Low** | Batch with other low-severity updates in a quarterly maintenance pass. | Within 1 quarter |

If no patched version exists, evaluate: Can the vulnerable code path be reached in this project? If not, document the risk acceptance. If yes, consider removing the dependency or finding an alternative.

## Breaking Change Evaluation

Before upgrading a major version:

1. **Read the changelog and migration guide.** Every major version bump has one. If it does not, treat the upgrade as high-risk.
2. **Check for deprecated APIs** used in the codebase. Grep for any symbols mentioned in the deprecation notices.
3. **Upgrade in isolation.** Change one dependency at a time. Never batch major version upgrades.
4. **Run the full test suite** after each upgrade. If tests fail, understand why before proceeding.
5. **Check peer dependency compatibility.** A major upgrade in one package may require coordinated upgrades in others.

## Lock File Conflicts

- **Never manually edit a lock file.** The results are unpredictable and often corrupt.
- **To resolve merge conflicts in lock files:** Accept either side, then regenerate by running the install command (`npm install`, `yarn install`, `pnpm install`, etc.) with no arguments.
- **Verify after merge:** Run `npm ci` (or equivalent) to confirm the lock file is consistent with the manifest.

## When to Upgrade vs. Pin vs. Downgrade

- **Upgrade** when: a security fix is available, the new version fixes a bug you hit, or you need a new feature.
- **Pin** when: an upgrade introduces a regression, the latest version has known issues, or you need reproducibility for a release.
- **Downgrade** when: an upgrade broke production and no forward-fix is available. Always pin the downgraded version and add a comment explaining why.

## Peer Dependency Resolution

- **Read the error message carefully.** It tells you exactly which versions are expected.
- **Prefer upgrading the parent package** to a version that accepts the peer, rather than forcing an incompatible peer.
- **If `--legacy-peer-deps` or `--force` is truly required**, add a comment in the project explaining why, and open an issue with the upstream package.
- **Document unresolvable peer conflicts** in the project README or a `DEPENDENCIES.md` file so future developers understand the constraint.
