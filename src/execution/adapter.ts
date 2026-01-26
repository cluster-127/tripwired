/**
 * Tripwired Execution Adapter - v0.2
 * Agent action execution interface
 */

import type { ExecutionResult, SafetyDecision } from '../core/types.js'

// =============================================================================
// EXECUTION ADAPTER INTERFACE
// =============================================================================

export interface ExecutionAdapter {
  execute(decision: SafetyDecision): Promise<ExecutionResult>
}

// =============================================================================
// DUMMY ADAPTER
// =============================================================================

/**
 * Blackhole adapter that logs but never executes
 * Default for development and testing
 */
export class DummyAdapter implements ExecutionAdapter {
  private executionLog: ExecutionResult[] = []

  async execute(decision: SafetyDecision): Promise<ExecutionResult> {
    const result: ExecutionResult = {
      executed: false,
      status: 'BLOCKED',
      tokensUsed: 0,
      latencyMs: 0,
      timestamp: Date.now(),
    }

    this.executionLog.push(result)

    // Log for telemetry
    console.log(
      JSON.stringify({
        type: 'EXECUTION_DUMMY',
        decision: {
          allowed: decision.allowed,
          reason: decision.reason,
        },
        result,
      }),
    )

    return result
  }

  /**
   * Get execution log for analysis
   */
  getLog(): readonly ExecutionResult[] {
    return this.executionLog
  }

  /**
   * Clear execution log
   */
  clearLog(): void {
    this.executionLog = []
  }
}

// =============================================================================
// LIVE ADAPTER PLACEHOLDER
// =============================================================================

/**
 * Placeholder for real agent execution adapter
 */
export class LiveAdapter implements ExecutionAdapter {
  constructor(
    private readonly config: {
      apiKey: string
      apiSecret: string
      testMode: boolean
    },
  ) {
    if (!config.testMode) {
      throw new Error('LiveAdapter: Production mode not yet implemented')
    }
  }

  async execute(_decision: SafetyDecision): Promise<ExecutionResult> {
    throw new Error('LiveAdapter: Not implemented')
  }
}
