/**
 * Tripwire Safety Gate - v0.2
 * Final gate before agent action
 *
 * Enforces: Token budget, API rate limits, loop/runaway vetoes
 */

import { CALIBRATION_CONFIG, HEALTH_THRESHOLDS, SAFETY_GATE_CONFIG } from '../core/contracts.js'
import type {
  ActivityState,
  ExecutionResult,
  HealthState,
  HealthStatus,
  IntentDecision,
  SafetyDecision,
  SafetyVeto,
} from '../core/types.js'

// =============================================================================
// SAFETY GATE TYPES
// =============================================================================

interface BudgetState {
  tokensUsed: number
  toolCalls: number
  windowStart: number
}

interface FrequencyTracking {
  events: number[]
  intervals: number[]
  meanInterval: number
}

interface SafetyGateState {
  budget: BudgetState
  frequency: FrequencyTracking
  lastEventTimestamp: number | null
  cooldownUntil: number | null
  health: HealthState
}

enum AnomalyType {
  SOFT = 'SOFT',
  HARD = 'HARD',
}

// =============================================================================
// SAFETY GATE
// =============================================================================

export class SafetyGate {
  private state: SafetyGateState

  constructor() {
    this.state = this.createInitialState()
  }

  /**
   * Evaluate intent decision and produce safety decision
   * This is the FINAL gate before agent action
   */
  evaluate(intent: IntentDecision, activityState: ActivityState): SafetyDecision {
    const now = Date.now()

    // Reset budget window if needed
    this.resetBudgetWindowIfNeeded(now)

    // STEP 1: System vetoes
    const veto = this.checkSystemVeto(intent, activityState, now)
    if (veto) {
      return this.createRejection(veto, now)
    }

    // STEP 2: Behavioral control (mode-based)
    const behaviorVeto = this.checkBehavioralVeto(activityState, now)
    if (behaviorVeto) {
      return this.createRejection(behaviorVeto, now)
    }

    // STEP 3: Budget check
    const budgetVeto = this.checkBudget()
    if (budgetVeto) {
      return this.createRejection(budgetVeto, now)
    }

    // All checks passed
    return {
      allowed: true,
      remainingBudget: this.getRemainingBudget(),
      reason: 'Allowed by SafetyGate: all checks passed',
      timestamp: now,
    }
  }

  /**
   * Record agent event for budget and frequency tracking
   */
  recordEvent(tokensUsed: number, toolCalls: number): void {
    const now = Date.now()

    this.resetBudgetWindowIfNeeded(now)

    // Update budget
    this.state.budget.tokensUsed += tokensUsed
    this.state.budget.toolCalls += toolCalls

    // Update frequency tracking
    if (this.state.lastEventTimestamp !== null) {
      const interval = now - this.state.lastEventTimestamp
      this.state.frequency.events.push(now)
      this.state.frequency.intervals.push(interval)
      this.updateIntervalMetrics()
    }

    this.state.lastEventTimestamp = now
  }

  /**
   * Record execution result for health tracking
   */
  recordExecutionResult(result: ExecutionResult, decision: SafetyDecision): void {
    if (result.executed) {
      // High latency → SOFT anomaly
      if (result.latencyMs > 10_000) {
        this.recordAnomaly(SAFETY_GATE_CONFIG.SOFT_ANOMALY_SEVERITY, AnomalyType.SOFT)
      }

      // Partial execution → SOFT anomaly
      if (result.status === 'PARTIAL') {
        this.recordAnomaly(SAFETY_GATE_CONFIG.SOFT_ANOMALY_SEVERITY, AnomalyType.SOFT)
      }
    } else if (decision.allowed) {
      // Should have executed but didn't → HARD anomaly
      this.recordAnomaly(SAFETY_GATE_CONFIG.HARD_ANOMALY_SEVERITY, AnomalyType.HARD)
    }
  }

  /**
   * Get current health state
   */
  getHealth(): HealthState {
    return this.state.health
  }

  /**
   * Get remaining token budget for current window
   */
  getRemainingBudget(): number {
    return Math.max(0, SAFETY_GATE_CONFIG.MAX_TOKENS_PER_MINUTE - this.state.budget.tokensUsed)
  }

  /**
   * Get current budget usage
   */
  getBudgetUsage(): { tokensUsed: number; toolCalls: number; remainingTokens: number } {
    return {
      tokensUsed: this.state.budget.tokensUsed,
      toolCalls: this.state.budget.toolCalls,
      remainingTokens: this.getRemainingBudget(),
    }
  }

  /**
   * Record an anomaly (affects health)
   */
  recordAnomaly(severity: number, _type: AnomalyType = AnomalyType.SOFT): void {
    const now = Date.now()
    const newScore = Math.max(0, this.state.health.score - severity)

    this.state.health = {
      score: newScore,
      status: this.deriveHealthStatus(newScore),
      lastAnomaly: now,
      anomalyCount: this.state.health.anomalyCount + 1,
      errorStreak: this.state.health.errorStreak + 1,
    }
  }

  /**
   * Tick health recovery (call periodically)
   */
  tickRecovery(): void {
    const now = Date.now()
    const health = this.state.health

    // Recovery only during anomaly-free periods
    if (health.lastAnomaly !== null) {
      const timeSinceAnomaly = now - health.lastAnomaly
      if (timeSinceAnomaly < 60_000) {
        return
      }
    }

    // Reset error streak after recovery period
    if (this.state.health.errorStreak > 0) {
      this.state.health = {
        ...health,
        errorStreak: 0,
      }
    }

    const newScore = Math.min(
      HEALTH_THRESHOLDS.RECOVERY_CAP,
      health.score + HEALTH_THRESHOLDS.RECOVERY_RATE,
    )

    this.state.health = {
      ...this.state.health,
      score: newScore,
      status: this.deriveHealthStatus(newScore),
    }
  }

  /**
   * Reset gate to initial state
   */
  reset(): void {
    this.state = this.createInitialState()
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private createInitialState(): SafetyGateState {
    return {
      budget: {
        tokensUsed: 0,
        toolCalls: 0,
        windowStart: Date.now(),
      },
      frequency: {
        events: [],
        intervals: [],
        meanInterval: 0,
      },
      lastEventTimestamp: null,
      cooldownUntil: null,
      health: {
        score: 1.0,
        status: 'HEALTHY',
        lastAnomaly: null,
        anomalyCount: 0,
        errorStreak: 0,
      },
    }
  }

  private resetBudgetWindowIfNeeded(now: number): void {
    const elapsed = now - this.state.budget.windowStart
    if (elapsed >= 60_000) {
      this.state.budget = {
        tokensUsed: 0,
        toolCalls: 0,
        windowStart: now,
      }
    }
  }

  private updateIntervalMetrics(): void {
    const intervals = this.state.frequency.intervals.slice(-10)
    if (intervals.length === 0) {
      this.state.frequency.meanInterval = 0
      return
    }

    this.state.frequency.meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
  }

  private checkSystemVeto(
    intent: IntentDecision,
    _activityState: ActivityState,
    now: number,
  ): SafetyVeto | null {
    // Confidence too low
    if (intent.confidence < CALIBRATION_CONFIG.CONFIDENCE_MINIMUM) {
      return 'HEALTH_DEGRADED'
    }

    // In cooldown
    if (this.state.cooldownUntil !== null && now < this.state.cooldownUntil) {
      return 'COOLDOWN_ACTIVE'
    }

    // Health degraded
    if (this.state.health.status === 'SUSPENDED' || this.state.health.status === 'STOPPED') {
      return 'HEALTH_DEGRADED'
    }

    return null
  }

  private checkBehavioralVeto(activityState: ActivityState, now: number): SafetyVeto | null {
    // RUNAWAY mode → immediate veto
    if (activityState.mode === 'RUNAWAY') {
      this.enterCooldown(now)
      return 'RUNAWAY_DETECTED'
    }

    // LOOPING mode → immediate veto
    if (activityState.mode === 'LOOPING') {
      this.enterCooldown(now)
      return 'LOOP_DETECTED'
    }

    // Tempo compression check
    if (this.isTempoCompressing()) {
      return 'RATE_LIMIT_EXCEEDED'
    }

    // Absolute frequency cap
    if (this.state.budget.toolCalls >= SAFETY_GATE_CONFIG.MAX_TOOL_CALLS_PER_MINUTE) {
      return 'RATE_LIMIT_EXCEEDED'
    }

    return null
  }

  private checkBudget(): SafetyVeto | null {
    if (this.state.budget.tokensUsed >= SAFETY_GATE_CONFIG.MAX_TOKENS_PER_MINUTE) {
      return 'TOKEN_BUDGET_EXCEEDED'
    }
    return null
  }

  private isTempoCompressing(): boolean {
    const intervals = this.state.frequency.intervals
    if (intervals.length < 4) return false

    const recent = intervals.slice(-3)
    const earlier = intervals.slice(-6, -3)
    if (earlier.length === 0) return false

    const recentMean = recent.reduce((a, b) => a + b, 0) / recent.length
    const earlierMean = earlier.reduce((a, b) => a + b, 0) / earlier.length

    return recentMean < earlierMean * SAFETY_GATE_CONFIG.TEMPO_COMPRESSION_RATIO
  }

  private enterCooldown(now: number): void {
    this.state.cooldownUntil = now + SAFETY_GATE_CONFIG.COOLDOWN_DURATION_MS
  }

  private createRejection(reason: SafetyVeto, timestamp: number): SafetyDecision {
    return {
      allowed: false,
      remainingBudget: this.getRemainingBudget(),
      reason: `Veto: ${reason}`,
      vetoReason: reason,
      timestamp,
    }
  }

  private deriveHealthStatus(score: number): HealthStatus {
    if (score < HEALTH_THRESHOLDS.HARD_STOP) return 'STOPPED'
    if (score < HEALTH_THRESHOLDS.SOFT_SUSPEND) return 'SUSPENDED'
    if (score < 0.8) return 'DEGRADED'
    return 'HEALTHY'
  }
}
