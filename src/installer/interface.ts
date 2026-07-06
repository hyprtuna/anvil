import type { InstallOptions, InstallSummary } from './install.js'

/**
 * Documentation type — the guarantees the installer upholds.
 * Every non-dry-run invocation of the installer satisfies these invariants.
 */
export interface InstallerGuarantees {
  /** Writes land via temp-file + rename so concurrent readers never see half-written files. */
  atomic: true
  /** Rerunning with identical inputs produces byte-identical output (aside from documented mtimes). */
  idempotent: true
  /** When a write in a batch fails, preceding writes from the same batch are rolled back. */
  rollback: 'mid-write'
  /** After successful write, verify step checks the on-disk tree matches the plan. */
  verified: 'post-write'
}

/**
 * Canonical installer signature.
 * Every adapter-agnostic driver (CLI `init`, TUI installer, integration tests)
 * depends on exactly this shape.
 */
export type InstallerFn = (opts: InstallOptions) => Promise<InstallSummary>

/**
 * Full installer contract. Pins `runInstaller` in place as the single
 * implementation of `InstallerFn`, while making the guarantees visible
 * to every downstream consumer.
 */
export interface InstallerContract {
  install: InstallerFn
  guarantees: InstallerGuarantees
}

export const INSTALLER_GUARANTEES: InstallerGuarantees = {
  atomic: true,
  idempotent: true,
  rollback: 'mid-write',
  verified: 'post-write',
}

export type { InstallOptions, InstallSummary }
