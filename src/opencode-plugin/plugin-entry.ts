// Production bundle entry — exposes ONLY the `server` named export that
// OpenCode 1.15.3 expects per the @opencode-ai/plugin PluginModule contract.
//
// Why this exists: when the bundle exports multiple named values
// (AnvilPlugin, shutdownAnvilPlugin, __resetShutdownHandlersForTests, etc.),
// OpenCode's plugin loader fails to detect a single-server PluginModule
// shape and falls back to iterating every exported function as a plugin.
// Our test helpers return undefined, and OC then crashes when it tries
// to invoke `.config()` on the undefined slots.
//
// Tests import directly from ./index.ts (where the test helpers live);
// production bundles esbuild from THIS file.
export { server } from './index.js'
