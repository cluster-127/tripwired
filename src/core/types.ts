/**
 * Tripwire Core Types - v0.2
 * LLM Agent Kill-Switch Types
 *
 * Behavioral control for autonomous AI agents
 */

// =============================================================================
// AGENT EVENT TYPES
// =============================================================================

/**
 * Agent activity event
 * Emitted by the agent runtime for each LLM interaction
 */
export interface AgentEvent {
  readonly timestamp: number
  readonly tokenCount: number // Tokens consumed in this event
  readonly toolCalls: number // Number of tool calls in this event
  readonly latencyMs: number // Response time
  readonly outputLength: number // Output character count
  readonly outputHash?: string // For loop detection (optional)
}

// =============================================================================
// ACTIVITY STATE TYPES
// =============================================================================

export type IntensityLevel = 'LOW' | 'NORMAL' | 'HIGH'

/**
 * Activity modes for agent behavioral classification
 *
 * IDLE: Agent waiting for input
 * WORKING: Normal productive activity
 * LOOPING: Repetitive output/behavior detected
 * RUNAWAY: Uncontrolled acceleration detected
 */
export type ActivityMode = 'IDLE' | 'WORKING' | 'LOOPING' | 'RUNAWAY'

/**
 * Agent activity state interpretation
 * reason field is MANDATORY - state without explanation is invalid
 */
export interface ActivityState {
  readonly intensity: IntensityLevel
  readonly mode: ActivityMode
  readonly reason: string
  readonly since: number
}

// =============================================================================
// INTENT TYPES
// =============================================================================

/**
 * Action intent from IntentCore
 *
 * CONTINUE: Agent may proceed
 * PAUSE: Agent should slow down or wait for input
 * STOP: Agent must halt immediately
 */
export type ActionIntent = 'CONTINUE' | 'PAUSE' | 'STOP'

/**
 * Intent decision from IntentCore
 * This is NOT an execution command - just an assessment
 */
export interface IntentDecision {
  readonly intent: ActionIntent
  readonly confidence: number // [0.0 - 1.0]
  readonly reason: string
  readonly timestamp: number
}

// =============================================================================
// SAFETY TYPES
// =============================================================================

/**
 * Safety veto reasons
 * Each veto has a specific behavioral trigger
 */
export type SafetyVeto =
  | 'RUNAWAY_DETECTED' // Uncontrolled activity acceleration
  | 'LOOP_DETECTED' // Repetitive output/tool calls
  | 'TOKEN_BUDGET_EXCEEDED' // Token limit reached
  | 'RATE_LIMIT_EXCEEDED' // API call rate too high
  | 'COOLDOWN_ACTIVE' // Forced wait period
  | 'HEALTH_DEGRADED' // System health below threshold

/**
 * Safety gate decision
 * This is the FINAL gate before agent action
 */
export interface SafetyDecision {
  readonly allowed: boolean
  readonly remainingBudget: number // Remaining token budget
  readonly reason: string
  readonly vetoReason?: SafetyVeto
  readonly timestamp: number
}

// =============================================================================
// EXECUTION TYPES
// =============================================================================

export type ExecutionStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'BLOCKED'

export interface ExecutionResult {
  readonly executed: boolean
  readonly status: ExecutionStatus
  readonly tokensUsed: number
  readonly latencyMs: number
  readonly timestamp: number
}

// =============================================================================
// HEALTH TYPES
// =============================================================================

export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'SUSPENDED' | 'STOPPED'

export interface HealthState {
  readonly score: number // [0.0 - 1.0]
  readonly status: HealthStatus
  readonly lastAnomaly: number | null
  readonly anomalyCount: number
  readonly errorStreak: number // Consecutive errors (v0.3 prep)
}

// =============================================================================
// SYSTEM EVENT TYPES (for telemetry)
// =============================================================================

export type SystemEvent =
  | { readonly type: 'AGENT_EVENT'; readonly event: AgentEvent }
  | {
      readonly type: 'STATE_CHANGE'
      readonly previous: ActivityState
      readonly current: ActivityState
    }
  | { readonly type: 'INTENT'; readonly intent: IntentDecision; readonly decision: SafetyDecision }
  | { readonly type: 'EXECUTION'; readonly result: ExecutionResult }
  | {
      readonly type: 'HEALTH_CHANGE'
      readonly previous: HealthState
      readonly current: HealthState
    }
  | { readonly type: 'ERROR'; readonly component: string; readonly error: string }
