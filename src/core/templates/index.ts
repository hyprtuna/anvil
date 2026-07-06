/**
 * ANV-0137 — Templates resolver module barrel.
 *
 * See `./resolver.ts` for the full contract documentation.
 *
 * ANV-0136 — DecisionPrompt schema + surface renderers exported alongside
 * the resolver. They live in the same module because both are about how
 * the templates layer presents structured prose to the agent / user.
 */

export {
  DecisionOption,
  DecisionPrompt,
  renderDecisionClaudeCode,
  renderDecisionMarkdown,
  renderDecisionOpenCode,
  renderDecisionPrompt,
} from './decision.js'
export type {
  AskUserQuestionPayload,
  DecisionSurface,
} from './decision.js'
export {
  renderDecisionWithRuntimeContext,
  resolveDecisionAutoMode,
  runtimeContextToAutoModeContext,
  writeDecisionAuditEntry,
} from './decision-runtime.js'
export type {
  DecisionAuditEntry,
  DecisionAutoModeContext,
  DecisionAutoModeOutcome,
  DecisionRenderResult,
  RenderDecisionWithRuntimeContextOptions,
} from './decision-runtime.js'
export {
  bodyContainsEmbeddedTemplateMarker,
  EMBEDDED_TEMPLATE_MARKER,
  findTemplateRefs,
  listUserTemplateOverrides,
  resolveTemplate,
  substituteTemplateRefs,
} from './resolver.js'
export type {
  ResolvedTemplate,
  TemplateResolutionContext,
  TemplateSurface,
} from './resolver.js'
