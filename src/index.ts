/**
 * Tripwire - Behavioral Control Kernel v0.2
 * LLM Agent Kill-Switch
 */

// Core types
export type {
  ActionIntent,
  ActivityMode,
  ActivityState,
  AgentEvent,
  ExecutionResult,
  ExecutionStatus,
  HealthState,
  HealthStatus,
  IntensityLevel,
  IntentDecision,
  SafetyDecision,
  SafetyVeto,
  SystemEvent,
} from './core/types.js'

// Contracts
export {
  ACTIVITY_ENGINE_CONFIG,
  CALIBRATION_CONFIG,
  deepFreeze,
  HEALTH_THRESHOLDS,
  INTENT_CORE_CONFIG,
  SAFETY_GATE_CONFIG,
} from './core/contracts.js'

// Engines
export { ActivityEngine } from './activity-engine/engine.js'
export type { ActivityEngineConfig } from './activity-engine/engine.js'

export { IntentCore } from './intent-core/core.js'

export { SafetyGate } from './safety-gate/engine.js'

// Execution
export { DummyAdapter, LiveAdapter } from './execution/adapter.js'
export type { ExecutionAdapter } from './execution/adapter.js'

// Monitoring
export { DriftMonitor } from './monitoring/drift-monitor.js'

// Runtime
export { FileLogger } from './runtime/file-logger.js'
export { Pipeline } from './runtime/pipeline.js'
export type { PipelineConfig, PipelineResult } from './runtime/pipeline.js'
