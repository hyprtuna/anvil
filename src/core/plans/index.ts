/**
 * Public surface of the executable-plan-contracts module (ANV-0026).
 *
 * Re-exports the schemas + parser so consumers can write
 * `import { ExecutablePlan, parseExecutablePlan } from '../core/plans/index.js'`
 * without reaching into individual files.
 */

export {
  ExecutablePlan,
  PlanComposition,
  PlanTask,
  PlanTaskEffort,
  PlanTaskType,
  PlanWave,
  TaskIdPattern,
} from './schema.js'
export {
  parseExecutablePlan,
  parseExecutablePlanFromFile,
  type ParseResult,
} from './parse.js'
// ANV-0025 Wave 3 — evented plan-runner schema + recorder
export {
  EvidenceAttachedEvent,
  GateApprovedEvent,
  GateRequestedEvent,
  PhaseCompletedEvent,
  PhaseStartedEvent,
  PLAN_RUN_EVENT_KINDS,
  PlanRunAbortedEvent,
  PlanRunCompletedEvent,
  PlanRunEvent,
  type PlanRunEventKind,
  PlanRunStartedEvent,
  TaskCompletedEvent,
  TaskStartedEvent,
} from './events/schema.js'
export {
  createRunRecorder,
  EVENTS_JOURNAL_FILENAME,
  type PlanRunRecorder,
  readEvents,
  type RecordResult,
} from './recorder.js'
export {
  applyEvent,
  initialRunState,
  PlanRunState,
  PlanRunStatus,
  replayState,
} from './run-state.js'
export {
  bootstrapRun,
  type BootstrapOpts,
  type BootstrapResult,
  PLAN_SNAPSHOT_FILENAME,
  STATE_SNAPSHOT_FILENAME,
  writeStateFile,
} from './bootstrap.js'
// ANV-0025 Wave 4 — runner state machine + step registry + statusline payload
export {
  classifyError,
  type ErrorClassification,
  type TaskFailureInfo,
} from './runner/classify.js'
export {
  createPlanRunner,
  type CreatePlanRunnerOpts,
  type PlanRunner,
  type RunnerHooks,
  type TaskCompletionResult,
} from './runner/runner.js'
export {
  buildStatuslinePayload,
  PlanRunStatuslinePayload,
} from './runner/statusline-payload.js'
export {
  DefaultExecutorStep,
  STEP_REGISTRY,
  type StepBase,
  type StepContext,
  type StepDispatcher,
  type StepResult,
} from './runner/step-registry.js'
