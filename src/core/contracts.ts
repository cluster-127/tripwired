/**
 * Tripwired Core Contracts - v0.2
 * LLM Agent Kill-Switch Configuration
 *
 * These values are FROZEN - do not modify at runtime
 */

// =============================================================================
// HEALTH THRESHOLDS
// =============================================================================

export const HEALTH_THRESHOLDS = {
  /** Below this: agent paused, human intervention suggested */
  SOFT_SUSPEND: 0.6,

  /** Below this: agent stopped immediately */
  HARD_STOP: 0.3,

  /** Recovery rate per minute (only during anomaly-free periods) */
  RECOVERY_RATE: 0.01,

  /** Maximum recovery level (never fully heals) */
  RECOVERY_CAP: 0.8,

  /** Consecutive errors before health penalty */
  ERROR_STREAK_THRESHOLD: 3,
} as const

// =============================================================================
// SAFETY GATE CONFIG (Agent Behavioral Control)
// =============================================================================

export const SAFETY_GATE_CONFIG = {
  // Token Budget
  /** Maximum tokens per minute before budget veto */
  MAX_TOKENS_PER_MINUTE: 50_000,

  /** Warning threshold (triggers intensity: HIGH) */
  TOKEN_WARNING_THRESHOLD: 40_000,

  // API Rate Limiting
  /** Maximum tool calls per minute */
  MAX_TOOL_CALLS_PER_MINUTE: 60,

  /** Warning threshold for tool calls */
  TOOL_CALL_WARNING_THRESHOLD: 45,

  // Loop Detection
  /** Similarity threshold for loop detection (0.0 - 1.0) */
  LOOP_SIMILARITY_THRESHOLD: 0.9,

  /** Number of recent outputs to compare for loops */
  LOOP_WINDOW_SIZE: 5,

  // Behavioral Control (from trading kernel)
  /** Cooldown after safety event (ms) */
  COOLDOWN_DURATION_MS: 60_000, // 1 minute

  /** Tempo compression ratio - if recent intervals < this * earlier, RUNAWAY */
  TEMPO_COMPRESSION_RATIO: 0.3,

  /** Monotonic growth threshold (consecutive same-pattern events) */
  MONOTONIC_THRESHOLD: 3,

  /** Acceleration threshold for token consumption */
  ACCELERATION_THRESHOLD: 5_000,

  /** History window for behavioral analysis (ms) */
  HISTORY_WINDOW_MS: 300_000, // 5 minutes

  // Anomaly Severity
  /** Soft anomaly (partial failure, high latency) */
  SOFT_ANOMALY_SEVERITY: 0.02,

  /** Hard anomaly (complete failure, loop detected) */
  HARD_ANOMALY_SEVERITY: 0.1,
} as const

// =============================================================================
// ACTIVITY ENGINE CONFIG (State Classification)
// =============================================================================

export const ACTIVITY_ENGINE_CONFIG = {
  /** Minimum time in state before transition allowed (ms) */
  MIN_STATE_DURATION_MS: 10_000, // 10 seconds

  /** Extended duration required to exit RUNAWAY/LOOPING */
  CRITICAL_EXIT_MULTIPLIER: 3,

  /** Low intensity threshold (tokens/minute) */
  INTENSITY_LOW_THRESHOLD: 5_000,

  /** High intensity threshold (tokens/minute) */
  INTENSITY_HIGH_THRESHOLD: 30_000,

  /** Buffer size for activity events */
  EVENT_BUFFER_SIZE: 100,
} as const

// =============================================================================
// INTENT CORE CONFIG
// =============================================================================

export const INTENT_CORE_CONFIG = {
  /** Minimum confidence to suggest CONTINUE */
  CONFIDENCE_MINIMUM: 0.2,

  /** Confidence decay rate per second */
  CONFIDENCE_DECAY_RATE: 0.0001,
} as const

// =============================================================================
// CALIBRATION CONFIG (Behavioral Unlock)
// =============================================================================

export const CALIBRATION_CONFIG = {
  /** Master calibration factor (1.0 = default) */
  FACTOR: 1.0,

  /** Apply factor to confidence minimum */
  get CONFIDENCE_MINIMUM(): number {
    return INTENT_CORE_CONFIG.CONFIDENCE_MINIMUM / this.FACTOR
  },
} as const

// =============================================================================
// TYPE UTILITIES
// =============================================================================

/** Deep freeze helper for config objects */
export function deepFreeze<T extends object>(obj: T): Readonly<T> {
  Object.freeze(obj)
  Object.getOwnPropertyNames(obj).forEach((prop) => {
    const value = (obj as Record<string, unknown>)[prop]
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value as object)
    }
  })
  return obj
}
