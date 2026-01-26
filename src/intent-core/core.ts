/**
 * Tripwire Intent Core - v0.2
 * Agent action intent assessment
 *
 * Determines: CONTINUE, PAUSE, or STOP based on activity state
 */

import { INTENT_CORE_CONFIG } from '../core/contracts.js'
import type { ActivityState, AgentEvent, IntentDecision } from '../core/types.js'

// =============================================================================
// INTENT CORE
// =============================================================================

export class IntentCore {
  private lastIntent: IntentDecision | null = null
  private tokenHistory: number[] = []
  private readonly historySize = 20

  /**
   * Update internal metrics from agent event
   */
  update(event: AgentEvent): void {
    this.tokenHistory.push(event.tokenCount)
    if (this.tokenHistory.length > this.historySize) {
      this.tokenHistory.shift()
    }
  }

  /**
   * Produce an intent decision based on current activity state
   */
  decide(state: ActivityState): IntentDecision {
    const now = Date.now()

    // Apply decay to existing intent if present
    if (this.lastIntent && this.lastIntent.intent !== 'PAUSE') {
      const decayed = this.applyDecay(this.lastIntent, now)
      if (decayed.confidence > 0) {
        // Check for invalidation (mode changed to critical)
        if (this.shouldInvalidate(decayed, state)) {
          this.lastIntent = this.createPause(now, 'Invalidated: activity mode critical')
          return this.lastIntent
        }
        this.lastIntent = decayed
        return this.lastIntent
      }
    }

    // Generate new intent based on state
    const intent = this.generateIntent(state, now)
    this.lastIntent = intent
    return intent
  }

  /**
   * Get last produced intent
   */
  getLastIntent(): IntentDecision | null {
    return this.lastIntent
  }

  /**
   * Reset intent state
   */
  reset(): void {
    this.lastIntent = null
    this.tokenHistory = []
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private generateIntent(state: ActivityState, timestamp: number): IntentDecision {
    // Priority 1: RUNAWAY mode → STOP immediately
    if (state.mode === 'RUNAWAY') {
      return {
        intent: 'STOP',
        confidence: 1.0,
        reason: 'RUNAWAY mode detected - uncontrolled activity',
        timestamp,
      }
    }

    // Priority 2: LOOPING mode → STOP to break the loop
    if (state.mode === 'LOOPING') {
      return {
        intent: 'STOP',
        confidence: 0.9,
        reason: 'LOOPING mode detected - repetitive behavior',
        timestamp,
      }
    }

    // Priority 3: HIGH intensity → PAUSE to allow cooldown
    if (state.intensity === 'HIGH') {
      return {
        intent: 'PAUSE',
        confidence: 0.7,
        reason: 'HIGH intensity - approaching resource limits',
        timestamp,
      }
    }

    // Priority 4: IDLE mode → CONTINUE with low confidence
    if (state.mode === 'IDLE') {
      return {
        intent: 'CONTINUE',
        confidence: 0.3,
        reason: 'IDLE mode - waiting for activity',
        timestamp,
      }
    }

    // Default: WORKING mode with NORMAL/LOW intensity → CONTINUE
    const confidence = this.calculateConfidence(state)
    return {
      intent: 'CONTINUE',
      confidence,
      reason: `WORKING mode: intensity=${state.intensity}`,
      timestamp,
    }
  }

  private calculateConfidence(state: ActivityState): number {
    // Base confidence from intensity
    let confidence: number

    switch (state.intensity) {
      case 'LOW':
        confidence = 0.8 // High confidence when activity is calm
        break
      case 'NORMAL':
        confidence = 0.6
        break
      case 'HIGH':
        confidence = 0.3 // Low confidence when activity is high
        break
      default:
        confidence = 0.5
    }

    // Adjust based on token history trend
    if (this.tokenHistory.length >= 5) {
      const trend = this.calculateTokenTrend()
      if (trend > 0.5) {
        // Rapidly increasing token usage
        confidence *= 0.7
      } else if (trend < -0.5) {
        // Decreasing token usage (good)
        confidence *= 1.1
      }
    }

    return Math.max(0.1, Math.min(confidence, 1.0))
  }

  private calculateTokenTrend(): number {
    if (this.tokenHistory.length < 5) return 0

    const recent = this.tokenHistory.slice(-3)
    const earlier = this.tokenHistory.slice(-6, -3)

    if (earlier.length === 0) return 0

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
    const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length

    if (earlierAvg === 0) return 0
    return (recentAvg - earlierAvg) / earlierAvg
  }

  private applyDecay(intent: IntentDecision, now: number): IntentDecision {
    const elapsed = now - intent.timestamp
    const decayRate = INTENT_CORE_CONFIG.CONFIDENCE_DECAY_RATE
    const decayedConfidence = Math.max(0, intent.confidence - (elapsed / 1000) * decayRate)

    return {
      ...intent,
      confidence: decayedConfidence,
      reason: `${intent.reason} (decayed)`,
    }
  }

  private shouldInvalidate(intent: IntentDecision, state: ActivityState): boolean {
    // Invalidate CONTINUE if mode becomes critical
    if (intent.intent === 'CONTINUE') {
      if (state.mode === 'RUNAWAY' || state.mode === 'LOOPING') {
        return true
      }
    }

    // Invalidate if intensity spikes and we were confident
    if (state.intensity === 'HIGH' && intent.confidence > 0.5) {
      return true
    }

    return false
  }

  private createPause(timestamp: number, reason: string): IntentDecision {
    return {
      intent: 'PAUSE',
      confidence: 0.5,
      reason,
      timestamp,
    }
  }
}
