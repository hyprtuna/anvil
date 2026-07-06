// spec D-21 said 18; actual count is 17 — `tui → installer` cluster has 6, not 7

export type AllowlistEntry = {
  from: string // path relative to repo root (e.g., "src/commands/cli/init.ts")
  to: string // path relative to repo root
  reason: string
}

export const LAYER_IMPORT_ALLOWLIST: readonly AllowlistEntry[] = [
  // --- commands → installer (10 edges) ---
  // pre-existing as of v0.11.0; entry-point commands invoke installer flows; see backlog#architecture-layer-ordering-revisit
  {
    from: 'src/commands/cli/doctor-checks/plugin.ts',
    to: 'src/installer/install.ts',
    reason:
      'ANV-0141; moved from doctor.ts to doctor-checks/plugin.ts; pre-existing installer bridge; see backlog#architecture-layer-ordering-revisit',
  },
  {
    from: 'src/commands/cli/doctor-checks/plugin.ts',
    to: 'src/installer/cross-contamination-check.ts',
    reason:
      'ANV-0141; moved from doctor.ts to doctor-checks/plugin.ts; ANV-0060 adapter cross-contamination bridge',
  },
  {
    from: 'src/commands/cli/init.ts',
    to: 'src/installer/context-from-repo.ts',
    reason:
      'pre-existing as of v0.11.0; entry-point commands invoke installer flows; see backlog#architecture-layer-ordering-revisit',
  },
  {
    from: 'src/commands/cli/init.ts',
    to: 'src/installer/diff.ts',
    reason:
      'pre-existing as of v0.11.0; entry-point commands invoke installer flows; see backlog#architecture-layer-ordering-revisit',
  },
  {
    from: 'src/commands/cli/init.ts',
    to: 'src/installer/link-cli.ts',
    reason:
      'pre-existing as of v0.11.0; entry-point commands invoke installer flows; see backlog#architecture-layer-ordering-revisit',
  },
  {
    from: 'src/commands/cli/init.ts',
    to: 'src/installer/sync.ts',
    reason:
      'pre-existing as of v0.11.0; entry-point commands invoke installer flows; see backlog#architecture-layer-ordering-revisit',
  },
  {
    from: 'src/commands/cli/init.ts',
    to: 'src/installer/wire.ts',
    reason:
      'pre-existing as of v0.11.0; entry-point commands invoke installer flows; see backlog#architecture-layer-ordering-revisit',
  },
  {
    from: 'src/commands/cli/uninstall.ts',
    to: 'src/installer/uninstall.ts',
    reason:
      'pre-existing as of v0.11.0; entry-point commands invoke installer flows; see backlog#architecture-layer-ordering-revisit',
  },
  {
    from: 'src/commands/cli/upgrade.ts',
    to: 'src/installer/plan.ts',
    reason:
      'pre-existing as of v0.11.0; entry-point commands invoke installer flows; see backlog#architecture-layer-ordering-revisit',
  },
  {
    from: 'src/commands/cli/upgrade.ts',
    to: 'src/installer/upgrade.ts',
    reason:
      'pre-existing as of v0.11.0; entry-point commands invoke installer flows; see backlog#architecture-layer-ordering-revisit',
  },
  // --- tui → installer (6 edges) ---
  // pre-existing as of v0.11.0; CLAUDE.md endorses "TUI delegates to installer"; see backlog#architecture-layer-ordering-revisit
  {
    from: 'src/tui/installer.ts',
    to: 'src/installer/context-from-repo.ts',
    reason:
      'pre-existing as of v0.11.0; CLAUDE.md endorses "TUI delegates to installer"; see backlog#architecture-layer-ordering-revisit',
  },
  {
    from: 'src/tui/installer.ts',
    to: 'src/installer/link-cli.ts',
    reason:
      'pre-existing as of v0.11.0; CLAUDE.md endorses "TUI delegates to installer"; see backlog#architecture-layer-ordering-revisit',
  },
  {
    from: 'src/tui/installer.ts',
    to: 'src/installer/sync.ts',
    reason:
      'pre-existing as of v0.11.0; CLAUDE.md endorses "TUI delegates to installer"; see backlog#architecture-layer-ordering-revisit',
  },
  {
    from: 'src/tui/installer.ts',
    to: 'src/installer/wire.ts',
    reason:
      'pre-existing as of v0.11.0; CLAUDE.md endorses "TUI delegates to installer"; see backlog#architecture-layer-ordering-revisit',
  },
  {
    from: 'src/tui/screens/preview.ts',
    to: 'src/installer/plan.ts',
    reason:
      'pre-existing as of v0.11.0; CLAUDE.md endorses "TUI delegates to installer"; see backlog#architecture-layer-ordering-revisit',
  },
  {
    from: 'src/tui/screens/uninstall.ts',
    to: 'src/installer/uninstall.ts',
    reason:
      'pre-existing as of v0.11.0; CLAUDE.md endorses "TUI delegates to installer"; see backlog#architecture-layer-ordering-revisit',
  },
  // ANV-0248: src/commands/cli/extension/ removed — CLI surface moved to
  // src/experimental/extensions/cli/. Experimental files are layer-floating
  // (UNREGISTERED_SRC_DIR_ALLOWLIST) so their edges are not scanned here.
  // --- ANV-0203 (P6) doctor-checks/extensions → installer/extensions (6 edges) ---
  {
    from: 'src/commands/cli/doctor-checks/extensions.ts',
    to: 'src/installer/extensions/collisions.ts',
    reason:
      'ANV-0203 P6: extensions doctor row runs collision detector (layer 4 → 7)',
  },
  {
    from: 'src/commands/cli/doctor-checks/extensions.ts',
    to: 'src/installer/extensions/manifest.ts',
    reason:
      'ANV-0203 P6: extensions doctor row re-validates stored manifests (layer 4 → 7)',
  },
  {
    from: 'src/commands/cli/doctor-checks/extensions.ts',
    to: 'src/installer/extensions/paths.ts',
    reason:
      'ANV-0203 P6: extensions doctor row reads registry path (layer 4 → 7)',
  },
  {
    from: 'src/commands/cli/doctor-checks/extensions.ts',
    to: 'src/installer/extensions/registry-types.ts',
    reason:
      'ANV-0203 P6: extensions doctor row uses registry types (layer 4 → 7)',
  },
  {
    from: 'src/commands/cli/doctor-checks/extensions.ts',
    to: 'src/installer/extensions/registry.ts',
    reason: 'ANV-0203 P6: extensions doctor row loads registry (layer 4 → 7)',
  },
  {
    from: 'src/commands/cli/doctor-checks/extensions.ts',
    to: 'src/installer/extensions/types.ts',
    reason:
      'ANV-0203 P6: extensions doctor row uses CollisionContext type (layer 4 → 7)',
  },
  // ANV-0246: catalog moved to src/experimental/catalog/ — no allowlist entries needed.
  // The layer-imports test skips experimental/ (returns layer -1) so cross-layer imports
  // from experimental/catalog/ into installer/ are tracked by the experimental-isolation
  // test instead of this allowlist.
  // --- commands → tui (2 edges) ---
  // pre-existing as of v0.11.0; entry-point commands trigger TUI flows; see backlog#architecture-layer-ordering-revisit
  {
    from: 'src/commands/cli/init.ts',
    to: 'src/tui/installer.ts',
    reason:
      'pre-existing as of v0.11.0; entry-point commands trigger TUI flows; see backlog#architecture-layer-ordering-revisit',
  },
  {
    from: 'src/commands/cli/uninstall.ts',
    to: 'src/tui/screens/uninstall.ts',
    reason:
      'pre-existing as of v0.11.0; entry-point commands trigger TUI flows; see backlog#architecture-layer-ordering-revisit',
  },
]
