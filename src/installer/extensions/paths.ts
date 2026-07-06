/**
 * ANV-0203 (P1) — Pure path helpers for the extension filesystem layout.
 *
 * All functions are deterministic and have no side effects. They accept
 * `anvilHome` (the resolved `~/.anvil` equivalent) and return absolute paths.
 *
 * Layer 7 — installer leaf. Imports from: node:path only.
 *
 * Directory layout (coordinated with ANV-0028):
 *
 *   <anvilHome>/extensions/
 *   ├── _registry.json          # ANV-0203 owns
 *   ├── _quarantine/            # ANV-0028 owns
 *   ├── _tmp/                   # SHARED
 *   │   └── install-<pid>-<ts>/
 *   └── <name>/                 # ANV-0203 owns
 *       ├── manifest.json
 *       ├── .install.json       # InstallRecord
 *       └── ... (extension payload)
 */

import { join } from 'node:path'

/**
 * Root directory for all extension state.
 * e.g. /home/user/.anvil/extensions
 */
export function extensionsRoot(anvilHome: string): string {
  return join(anvilHome, 'extensions')
}

/**
 * Path to the authoritative installed-extension catalog.
 * e.g. /home/user/.anvil/extensions/_registry.json
 */
export function registryPath(anvilHome: string): string {
  return join(extensionsRoot(anvilHome), '_registry.json')
}

/**
 * Root directory for a single installed extension.
 * e.g. /home/user/.anvil/extensions/my-ext
 */
export function extensionDir(anvilHome: string, name: string): string {
  return join(extensionsRoot(anvilHome), name)
}

/**
 * Path to the InstallRecord sidecar file for an installed extension.
 * e.g. /home/user/.anvil/extensions/my-ext/.install.json
 */
export function installRecordPath(anvilHome: string, name: string): string {
  return join(extensionDir(anvilHome, name), '.install.json')
}

/**
 * Shared scratch directory for atomic staging.
 * e.g. /home/user/.anvil/extensions/_tmp
 */
export function tmpDir(anvilHome: string): string {
  return join(extensionsRoot(anvilHome), '_tmp')
}

/**
 * A pid+timestamp-stamped staging directory for a single install run.
 * Guaranteed unique per process invocation per millisecond.
 * e.g. /home/user/.anvil/extensions/_tmp/install-12345-1716900000000
 *
 * Callers are responsible for creating this directory via `mkdir -p` and
 * deleting it (via `rm -rf`) on completion or failure.
 */
export function tmpInstallDir(anvilHome: string): string {
  return join(tmpDir(anvilHome), `install-${process.pid}-${Date.now()}`)
}
