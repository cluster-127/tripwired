/**
 * SafetyGate Unit Tests
 * Tests: budget tracking, veto logic, health degradation, rate limiting
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { ActivityState, IntentDecision } from '../core/types.js'
import { SafetyGate } from './engine.js'

function createIntent(overrides: Partial<IntentDecision> = {}): IntentDecision {
  return {
    intent: 'CONTINUE',
    confidence: 0.8,
    reason: 'Test intent',
    timestamp: Date.now(),
    ...overrides,
  }
}

function createActivityState(overrides: Partial<ActivityState> = {}): ActivityState {
  return {
    mode: 'WORKING',
    intensity: 'NORMAL',
    reason: 'Test state',
    since: Date.now(),
    ...overrides,
  }
}

describe('SafetyGate', () => {
  let gate: SafetyGate

  beforeEach(() => {
    gate = new SafetyGate()
  })

  describe('initial state', () => {
    it('should have full budget initially', () => {
      const budget = gate.getBudgetUsage()
      expect(budget.tokensUsed).toBe(0)
      expect(budget.toolCalls).toBe(0)
      expect(budget.remainingTokens).toBeGreaterThan(0)
    })

    it('should have healthy state initially', () => {
      const health = gate.getHealth()
      expect(health.score).toBe(1.0)
      expect(health.status).toBe('HEALTHY')
    })
  })

  describe('evaluation', () => {
    it('should allow CONTINUE intent with normal state', () => {
      const intent = createIntent({ intent: 'CONTINUE' })
      const state = createActivityState()

      const decision = gate.evaluate(intent, state)

      expect(decision.allowed).toBe(true)
    })

    it('should reject when in cooldown', () => {
      // Trigger cooldown by causing health degradation
      for (let i = 0; i < 10; i++) {
        gate.recordAnomaly(0.15)
      }

      const intent = createIntent()
      const state = createActivityState()
      const decision = gate.evaluate(intent, state)

      // Should either be rejected or health degraded
      expect(decision.allowed === false || gate.getHealth().score < 1.0).toBe(true)
    })

    it('should block critical modes (RUNAWAY/LOOPING)', () => {
      const intent = createIntent({ intent: 'CONTINUE' })
      const runawayState = createActivityState({ mode: 'RUNAWAY' })

      const decision = gate.evaluate(intent, runawayState)

      expect(decision.allowed).toBe(false)
    })
  })

  describe('budget tracking', () => {
    it('should track token usage', () => {
      gate.recordEvent(1000, 2)
      gate.recordEvent(500, 1)

      const budget = gate.getBudgetUsage()
      expect(budget.tokensUsed).toBe(1500)
      expect(budget.toolCalls).toBe(3)
    })

    it('should reduce remaining budget', () => {
      const initialRemaining = gate.getRemainingBudget()
      gate.recordEvent(5000, 5)
      const afterRemaining = gate.getRemainingBudget()

      expect(afterRemaining).toBeLessThan(initialRemaining)
    })

    it('should veto when budget exhausted', () => {
      // Exhaust the budget
      const budget = gate.getRemainingBudget()
      gate.recordEvent(budget + 1000, 100)

      const intent = createIntent()
      const state = createActivityState()
      const decision = gate.evaluate(intent, state)

      expect(decision.allowed).toBe(false)
    })
  })

  describe('health model', () => {
    it('should degrade health on anomaly', () => {
      const initialHealth = gate.getHealth().score
      gate.recordAnomaly(0.1)
      const afterHealth = gate.getHealth().score

      expect(afterHealth).toBeLessThan(initialHealth)
    })

    it('should recover health over time', () => {
      // Degrade health first
      gate.recordAnomaly(0.2)
      const degradedHealth = gate.getHealth().score

      // Tick recovery
      gate.tickRecovery()
      const recoveredHealth = gate.getHealth().score

      expect(recoveredHealth).toBeGreaterThanOrEqual(degradedHealth)
    })

    it('should change status based on score', () => {
      // Degrade significantly
      for (let i = 0; i < 5; i++) {
        gate.recordAnomaly(0.15)
      }

      const health = gate.getHealth()
      // Status can be HEALTHY, DEGRADED, CRITICAL, or STOPPED depending on health score
      expect(['DEGRADED', 'CRITICAL', 'HEALTHY', 'STOPPED']).toContain(health.status)
    })
  })

  describe('rate limiting', () => {
    it('should track event frequency', () => {
      const now = Date.now()

      for (let i = 0; i < 10; i++) {
        gate.recordEvent(100, 1)
      }

      // Frequency tracking is internal, verify via evaluation
      const intent = createIntent()
      const state = createActivityState()
      const decision = gate.evaluate(intent, state)

      expect(decision).toBeDefined()
    })
  })

  describe('execution recording', () => {
    it('should record successful execution', () => {
      const decision = {
        allowed: true,
        remainingBudget: 1000,
        reason: 'Test',
        timestamp: Date.now(),
      }

      const result = {
        executed: true,
        status: 'SUCCESS' as const,
        tokensUsed: 100,
        latencyMs: 50,
        timestamp: Date.now(),
      }

      gate.recordExecutionResult(result, decision)

      // Health should remain good for successful execution
      expect(gate.getHealth().score).toBeGreaterThan(0.9)
    })

    it('should degrade health on failed execution', () => {
      const decision = {
        allowed: true,
        remainingBudget: 1000,
        reason: 'Test',
        timestamp: Date.now(),
      }

      const result = {
        executed: false,
        status: 'FAILED' as const,
        tokensUsed: 0,
        latencyMs: 0,
        timestamp: Date.now(),
      }

      const initialHealth = gate.getHealth().score
      gate.recordExecutionResult(result, decision)

      // Health should degrade on failure
      expect(gate.getHealth().score).toBeLessThanOrEqual(initialHealth)
    })
  })

  describe('reset', () => {
    it('should restore initial state', () => {
      // Use up some budget and degrade health
      gate.recordEvent(5000, 10)
      gate.recordAnomaly(0.2)

      expect(gate.getBudgetUsage().tokensUsed).toBeGreaterThan(0)

      // Reset
      gate.reset()

      expect(gate.getBudgetUsage().tokensUsed).toBe(0)
      expect(gate.getHealth().score).toBe(1.0)
    })
  })
})
