/**
 * Tripwired Runtime Pipeline - v0.2
 * Agent event processing orchestrator
 */

import { createHash } from 'crypto'
import { ActivityEngine } from '../activity-engine/engine.js'
import type {
  ActivityState,
  AgentEvent,
  ExecutionResult,
  IntentDecision,
  SafetyDecision,
  SystemEvent,
} from '../core/types.js'
import type { ExecutionAdapter } from '../execution/adapter.js'
import { DummyAdapter } from '../execution/adapter.js'
import { IntentCore } from '../intent-core/core.js'
import { DriftMonitor } from '../monitoring/drift-monitor.js'
import { SafetyGate } from '../safety-gate/engine.js'
import type { FileLogger } from './file-logger.js'

// =============================================================================
// PIPELINE TYPES
// =============================================================================

export interface PipelineConfig {
  adapter?: ExecutionAdapter
  logger?: FileLogger
}

export interface PipelineResult {
  events: SystemEvent[]
  hash: string
}

// =============================================================================
// PIPELINE
// =============================================================================

export class Pipeline {
  private readonly activityEngine: ActivityEngine
  private readonly intentCore: IntentCore
  private readonly safetyGate: SafetyGate
  private readonly driftMonitor: DriftMonitor
  private readonly adapter: ExecutionAdapter
  private readonly logger?: FileLogger

  private events: SystemEvent[] = []
  private hasher = createHash('sha256')

  constructor(config: PipelineConfig = {}) {
    this.activityEngine = new ActivityEngine()
    this.intentCore = new IntentCore()
    this.safetyGate = new SafetyGate()
    this.driftMonitor = new DriftMonitor()
    this.adapter = config.adapter ?? new DummyAdapter()
    if (config.logger) {
      this.logger = config.logger
    }
  }

  /**
   * Process a single agent event through the pipeline
   */
  async process(event: AgentEvent): Promise<{
    state: ActivityState
    intent: IntentDecision
    decision: SafetyDecision
    result: ExecutionResult
  }> {
    try {
      // Record event for hash
      this.recordForHash('event', event)
      this.pushEvent({ type: 'AGENT_EVENT', event })

      // Step 1: ActivityEngine - classify agent behavior
      let state: ActivityState
      try {
        const previousState = this.activityEngine.getState()
        state = this.activityEngine.process(event)

        if (previousState && this.stateChanged(previousState, state)) {
          this.pushEvent({ type: 'STATE_CHANGE', previous: previousState, current: state })

          // Feed DriftMonitor with state transition
          this.driftMonitor.recordStateTransition({
            from: previousState.mode,
            to: state.mode,
            timestamp: Date.now(),
          })
        }
      } catch (error) {
        // Graceful degradation: use defensive state
        const lastState = this.activityEngine.getState()
        state = lastState || {
          intensity: 'HIGH',
          mode: 'RUNAWAY', // Defensive: assume RUNAWAY on error
          reason: `ActivityEngine error: ${error instanceof Error ? error.message : 'Unknown'}`,
          since: Date.now(),
        }
        this.pushEvent({ type: 'ERROR', component: 'ActivityEngine', error: String(error) })
      }

      // Step 2: IntentCore - determine action intent
      let intent: IntentDecision
      try {
        this.intentCore.update(event)
        intent = this.intentCore.decide(state)
        this.recordForHash('intent', intent)
      } catch (error) {
        // Graceful degradation: PAUSE intent
        intent = {
          intent: 'PAUSE',
          confidence: 0,
          reason: `IntentCore error: ${error instanceof Error ? error.message : 'Unknown'}`,
          timestamp: Date.now(),
        }
        this.pushEvent({ type: 'ERROR', component: 'IntentCore', error: String(error) })
      }

      // Step 3: SafetyGate - final veto decision
      let decision: SafetyDecision
      try {
        decision = this.safetyGate.evaluate(intent, state)
        this.safetyGate.recordEvent(event.tokenCount, event.toolCalls)
        this.recordForHash('decision', decision)
        this.pushEvent({ type: 'INTENT', intent, decision })

        // Feed DriftMonitor with decision data
        const now = Date.now()
        this.driftMonitor.recordDecision({
          wasVetoed: !decision.allowed,
          confidence: intent.confidence,
          timestamp: now,
        })
        this.driftMonitor.tick(now)
      } catch (error) {
        // Graceful degradation: always reject
        decision = {
          allowed: false,
          remainingBudget: 0,
          reason: `SafetyGate error: ${error instanceof Error ? error.message : 'Unknown'}`,
          timestamp: Date.now(),
        }
        this.pushEvent({ type: 'ERROR', component: 'SafetyGate', error: String(error) })
      }

      // Step 4: ExecutionAdapter
      let result: ExecutionResult
      try {
        // INVARIANT: Never execute if decision not allowed
        if (!decision.allowed) {
          result = {
            executed: false,
            status: 'BLOCKED',
            tokensUsed: 0,
            latencyMs: 0,
            timestamp: Date.now(),
          }
        } else {
          result = await this.adapter.execute(decision as any)
        }

        this.recordForHash('result', result)
        this.pushEvent({ type: 'EXECUTION', result })
      } catch (error) {
        // Graceful degradation: execution failed
        result = {
          executed: false,
          status: 'FAILED',
          tokensUsed: 0,
          latencyMs: 0,
          timestamp: Date.now(),
        }
        this.pushEvent({ type: 'ERROR', component: 'ExecutionAdapter', error: String(error) })
      }

      return { state, intent, decision, result }
    } catch (error) {
      // Catastrophic failure: rethrow
      throw new Error(
        `Pipeline catastrophic failure: ${error instanceof Error ? error.message : 'Unknown'}`,
      )
    }
  }

  /**
   * Run pipeline on a sequence of events
   */
  async run(events: AgentEvent[]): Promise<PipelineResult> {
    for (const event of events) {
      await this.process(event)
    }

    return {
      events: this.events,
      hash: this.hasher.digest('hex'),
    }
  }

  /**
   * Get current system health
   */
  getHealth() {
    return this.safetyGate.getHealth()
  }

  /**
   * Reset all components
   */
  reset(): void {
    this.activityEngine.reset()
    this.intentCore.reset()
    this.safetyGate.reset()
    this.events = []
    this.hasher = createHash('sha256')
  }

  /**
   * Record an execution result for health tracking
   */
  recordExecution(result: ExecutionResult, decision?: SafetyDecision): void {
    const defaultDecision: SafetyDecision = decision ?? {
      allowed: true,
      remainingBudget: 0,
      reason: 'External execution',
      timestamp: Date.now(),
    }

    this.safetyGate.recordExecutionResult(result, defaultDecision)
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private recordForHash(type: string, data: object): void {
    this.hasher.update(JSON.stringify({ type, data }))
  }

  private stateChanged(prev: ActivityState, curr: ActivityState): boolean {
    return prev.intensity !== curr.intensity || prev.mode !== curr.mode
  }

  private pushEvent(event: SystemEvent): void {
    this.events.push(event)
    this.logger?.log(event)
  }
}
