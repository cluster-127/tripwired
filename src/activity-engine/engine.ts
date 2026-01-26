/**
 * Tripwired Activity Engine - v0.2
 * Agent behavioral state classification
 *
 * Detects: IDLE, WORKING, LOOPING, RUNAWAY modes
 */

import { ACTIVITY_ENGINE_CONFIG, SAFETY_GATE_CONFIG } from '../core/contracts.js'
import type { ActivityMode, ActivityState, AgentEvent, IntensityLevel } from '../core/types.js'

// =============================================================================
// ACTIVITY ENGINE
// =============================================================================

export interface ActivityEngineConfig {
  /** Injectable clock function for testing */
  clock?: () => number
}

export class ActivityEngine {
  private currentState: ActivityState | null = null
  private eventBuffer: AgentEvent[] = []
  private outputHashes: string[] = []
  private readonly clock: () => number

  constructor(config: ActivityEngineConfig = {}) {
    this.clock = config.clock ?? (() => Date.now())
  }

  /**
   * Process an agent event and produce activity state
   */
  process(event: AgentEvent): ActivityState {
    this.updateBuffer(event)

    if (this.currentState === null) {
      this.currentState = this.computeState('Initial state computation')
      return this.currentState
    }

    const candidateState = this.computeState('Periodic recomputation')

    if (this.shouldTransition(candidateState)) {
      this.currentState = candidateState
    }

    return this.currentState
  }

  /**
   * Get current state without processing
   */
  getState(): ActivityState | null {
    return this.currentState
  }

  /**
   * Reset engine state
   */
  reset(): void {
    this.currentState = null
    this.eventBuffer = []
    this.outputHashes = []
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private updateBuffer(event: AgentEvent): void {
    this.eventBuffer.push(event)

    if (this.eventBuffer.length > ACTIVITY_ENGINE_CONFIG.EVENT_BUFFER_SIZE) {
      this.eventBuffer.shift()
    }

    // Track output hashes for loop detection
    if (event.outputHash) {
      this.outputHashes.push(event.outputHash)
      if (this.outputHashes.length > SAFETY_GATE_CONFIG.LOOP_WINDOW_SIZE) {
        this.outputHashes.shift()
      }
    }
  }

  private computeState(reason: string): ActivityState {
    const intensity = this.computeIntensity()
    const mode = this.computeMode(intensity)

    return {
      intensity,
      mode,
      reason: `${reason}: intensity=${intensity}, mode=${mode}`,
      since: this.clock(),
    }
  }

  /**
   * Compute activity intensity based on token consumption rate
   */
  private computeIntensity(): IntensityLevel {
    if (this.eventBuffer.length < 3) return 'NORMAL'

    const recent = this.eventBuffer.slice(-10)
    const totalTokens = recent.reduce((sum, e) => sum + e.tokenCount, 0)

    // Calculate tokens per minute
    const timeSpan =
      recent.length > 1 ? recent[recent.length - 1]!.timestamp - recent[0]!.timestamp : 60_000
    const tokensPerMinute = timeSpan > 0 ? (totalTokens / timeSpan) * 60_000 : totalTokens

    if (tokensPerMinute < ACTIVITY_ENGINE_CONFIG.INTENSITY_LOW_THRESHOLD) {
      return 'LOW'
    }
    if (tokensPerMinute > ACTIVITY_ENGINE_CONFIG.INTENSITY_HIGH_THRESHOLD) {
      return 'HIGH'
    }
    return 'NORMAL'
  }

  /**
   * Compute activity mode based on behavioral patterns
   */
  private computeMode(intensity: IntensityLevel): ActivityMode {
    // Priority 1: Check for LOOPING (repetitive outputs)
    if (this.isLooping()) {
      return 'LOOPING'
    }

    // Priority 2: Check for RUNAWAY (tempo compression + high intensity)
    if (this.isRunaway(intensity)) {
      return 'RUNAWAY'
    }

    // Priority 3: Check for IDLE (no recent activity)
    if (this.isIdle()) {
      return 'IDLE'
    }

    return 'WORKING'
  }

  /**
   * Detect looping behavior using output hash similarity
   */
  private isLooping(): boolean {
    if (this.outputHashes.length < SAFETY_GATE_CONFIG.LOOP_WINDOW_SIZE) {
      return false
    }

    const recent = this.outputHashes.slice(-SAFETY_GATE_CONFIG.LOOP_WINDOW_SIZE)

    // Count matching hashes (exact match for now, can extend to similarity)
    const uniqueHashes = new Set(recent)
    const repetitionRatio = 1 - uniqueHashes.size / recent.length

    return repetitionRatio >= SAFETY_GATE_CONFIG.LOOP_SIMILARITY_THRESHOLD
  }

  /**
   * Detect runaway behavior using tempo compression
   */
  private isRunaway(intensity: IntensityLevel): boolean {
    if (this.eventBuffer.length < 6 || intensity !== 'HIGH') {
      return false
    }

    // Calculate interval compression
    const intervals = this.computeIntervals()
    if (intervals.length < 4) return false

    const recent = intervals.slice(-3)
    const earlier = intervals.slice(0, -3)

    if (earlier.length === 0) return false

    const recentMean = recent.reduce((a, b) => a + b, 0) / recent.length
    const earlierMean = earlier.reduce((a, b) => a + b, 0) / earlier.length

    // Tempo is compressing if recent intervals are significantly shorter
    return recentMean < earlierMean * SAFETY_GATE_CONFIG.TEMPO_COMPRESSION_RATIO
  }

  /**
   * Detect idle state (no activity for extended period)
   */
  private isIdle(): boolean {
    if (this.eventBuffer.length === 0) return true

    const lastEvent = this.eventBuffer[this.eventBuffer.length - 1]!
    const timeSinceLastEvent = this.clock() - lastEvent.timestamp

    // Idle if no event for more than 30 seconds
    return timeSinceLastEvent > 30_000
  }

  /**
   * Compute intervals between events
   */
  private computeIntervals(): number[] {
    const intervals: number[] = []
    for (let i = 1; i < this.eventBuffer.length; i++) {
      const current = this.eventBuffer[i]!
      const previous = this.eventBuffer[i - 1]!
      intervals.push(current.timestamp - previous.timestamp)
    }
    return intervals
  }

  private shouldTransition(candidate: ActivityState): boolean {
    if (this.currentState === null) return true

    const elapsed = this.clock() - this.currentState.since
    const minDuration = ACTIVITY_ENGINE_CONFIG.MIN_STATE_DURATION_MS

    // Minimum duration check
    if (elapsed < minDuration) {
      return false
    }

    // Extended duration for critical mode exit (LOOPING/RUNAWAY)
    const criticalModes: ActivityMode[] = ['LOOPING', 'RUNAWAY']
    if (
      criticalModes.includes(this.currentState.mode) &&
      !criticalModes.includes(candidate.mode) &&
      elapsed < minDuration * ACTIVITY_ENGINE_CONFIG.CRITICAL_EXIT_MULTIPLIER
    ) {
      return false
    }

    // Only transition if state actually changed
    return (
      this.currentState.intensity !== candidate.intensity ||
      this.currentState.mode !== candidate.mode
    )
  }
}
