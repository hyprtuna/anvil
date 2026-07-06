// Core types
export * from './types.js'

// Config
export { buildDefaultConfig } from './config/defaults.js'
export { buildPreset } from './config/presets.js'
export { resolvePaths } from './config/paths.js'
export { loadConfig, saveConfig } from './config/load.js'
export type { LoadConfigOptions } from './config/load.js'
export type { ResolvePathsOptions, ResolvedPaths } from './config/paths.js'

// Models
export { resolveAlias } from './models/aliases.js'
export { resolveModel } from './models/resolve.js'
export { traceResolution } from './models/trace.js'
export type { ResolveOptions } from './models/resolve.js'
export type { TraceEntry } from './models/trace.js'

// Project detection
export { detectProject } from './project/detect.js'
export { detectLanguages } from './project/detectors/language.js'
export type { LanguageResult } from './project/stack.js'
export type { FrameworkResult } from './project/detectors/framework.js'
export type { RunnerResult } from './project/detectors/test-runner.js'
export type { PackageManagerResult } from './project/detectors/package-manager.js'
export type { CIResult } from './project/detectors/ci.js'

// Registries
export { SkillRegistry } from './registry/skill-registry.js'
export { HookRegistry } from './registry/hook-registry.js'
export { AgentRegistry } from './registry/agent-registry.js'
export type { RegisteredHook } from './registry/hook-registry.js'
