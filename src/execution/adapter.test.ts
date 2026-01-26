/**
 * Tripwire Execution Adapter Tests - v0.2
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { SafetyDecision } from '../core/types.js'
import { DummyAdapter } from './adapter.js'

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createDecision(overrides: Partial<SafetyDecision> = {}): SafetyDecision {
  return {
    allowed: false,
    remainingBudget: 0,
    reason: 'Test decision',
    timestamp: Date.now(),
    ...overrides,
  }
}

// =============================================================================
// DUMMY ADAPTER TESTS
// =============================================================================

describe('DummyAdapter', () => {
  let adapter: DummyAdapter

  beforeEach(() => {
    adapter = new DummyAdapter()
  })

  describe('execute', () => {
    it('should always return executed=false', async () => {
      const decision = createDecision({ allowed: true })
      const result = await adapter.execute(decision)

      expect(result.executed).toBe(false)
    })

    it('should return BLOCKED status', async () => {
      const decision = createDecision()
      const result = await adapter.execute(decision)

      expect(result.status).toBe('BLOCKED')
      expect(result.tokensUsed).toBe(0)
    })

    it('should log execution to internal log', async () => {
      const decision = createDecision({ allowed: true })

      await adapter.execute(decision)

      const log = adapter.getLog()
      expect(log.length).toBe(1)
      expect(log[0]?.executed).toBe(false)
    })

    it('should accumulate multiple executions in log', async () => {
      const decision1 = createDecision({ allowed: true })
      const decision2 = createDecision({ allowed: false })

      await adapter.execute(decision1)
      await adapter.execute(decision2)

      const log = adapter.getLog()
      expect(log.length).toBe(2)
    })

    it('should include timestamp in result', async () => {
      const decision = createDecision()
      const result = await adapter.execute(decision)

      expect(result.timestamp).toBeDefined()
      expect(typeof result.timestamp).toBe('number')
    })
  })

  describe('getLog', () => {
    it('should return readonly log', async () => {
      const decision = createDecision()
      await adapter.execute(decision)

      const log = adapter.getLog()
      expect(log.length).toBe(1)
      expect(Array.isArray(log)).toBe(true)
    })
  })

  describe('clearLog', () => {
    it('should clear execution log', async () => {
      const decision = createDecision()
      await adapter.execute(decision)
      await adapter.execute(decision)

      expect(adapter.getLog().length).toBe(2)

      adapter.clearLog()

      expect(adapter.getLog().length).toBe(0)
    })
  })
})
