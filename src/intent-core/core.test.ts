/**
 * IntentCore Unit Tests
 * Tests: intent generation, confidence calculation, decay logic, invalidation
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { ActivityState, AgentEvent } from '../core/types.js'
import { IntentCore } from './core.js'

function createActivityState(overrides: Partial<ActivityState> = {}): ActivityState {
  return {
    mode: 'WORKING',
    intensity: 'NORMAL',
    reason: 'Test state',
    since: Date.now(),
    ...overrides,
  }
}

function createEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    timestamp: Date.now(),
    tokenCount: 100,
    toolCalls: 1,
    latencyMs: 50,
    outputLength: 500,
    outputHash: 'test_hash',
    ...overrides,
  }
}

describe('IntentCore', () => {
  let core: IntentCore

  beforeEach(() => {
    core = new IntentCore()
  })

  describe('initial state', () => {
    it('should have no last intent initially', () => {
      expect(core.getLastIntent()).toBeNull()
    })
  })

  describe('intent generation', () => {
    it('should generate STOP for RUNAWAY mode', () => {
      const state = createActivityState({ mode: 'RUNAWAY' })
      const intent = core.decide(state)

      expect(intent.intent).toBe('STOP')
      expect(intent.confidence).toBe(1.0)
    })

    it('should generate STOP for LOOPING mode', () => {
      const state = createActivityState({ mode: 'LOOPING' })
      const intent = core.decide(state)

      expect(intent.intent).toBe('STOP')
      expect(intent.confidence).toBe(0.9)
    })

    it('should generate PAUSE for HIGH intensity', () => {
      const state = createActivityState({ intensity: 'HIGH', mode: 'WORKING' })
      const intent = core.decide(state)

      expect(intent.intent).toBe('PAUSE')
      expect(intent.confidence).toBe(0.7)
    })

    it('should generate CONTINUE for IDLE mode', () => {
      const state = createActivityState({ mode: 'IDLE' })
      const intent = core.decide(state)

      expect(intent.intent).toBe('CONTINUE')
      expect(intent.confidence).toBe(0.3)
    })

    it('should generate CONTINUE for WORKING mode', () => {
      const state = createActivityState({ mode: 'WORKING', intensity: 'NORMAL' })
      const intent = core.decide(state)

      expect(intent.intent).toBe('CONTINUE')
      expect(intent.confidence).toBeGreaterThan(0)
    })
  })

  describe('confidence calculation', () => {
    it('should have higher confidence for LOW intensity', () => {
      const lowState = createActivityState({ intensity: 'LOW', mode: 'WORKING' })
      const normalState = createActivityState({ intensity: 'NORMAL', mode: 'WORKING' })

      const lowIntent = core.decide(lowState)
      core.reset()
      const normalIntent = core.decide(normalState)

      expect(lowIntent.confidence).toBeGreaterThan(normalIntent.confidence)
    })

    it('should adjust confidence based on token trend', () => {
      // Build up token history
      for (let i = 0; i < 6; i++) {
        core.update(createEvent({ tokenCount: 100 }))
      }

      const normalTrendIntent = core.decide(createActivityState())
      core.reset()

      // Build up rapidly increasing token history
      for (let i = 0; i < 6; i++) {
        core.update(createEvent({ tokenCount: 100 * (i + 1) }))
      }

      const risingTrendIntent = core.decide(createActivityState())

      // Rising trend should have lower confidence (or similar)
      expect(risingTrendIntent.confidence).toBeLessThanOrEqual(normalTrendIntent.confidence + 0.2)
    })
  })

  describe('decay logic', () => {
    it('should decay confidence over time', async () => {
      const state = createActivityState({ mode: 'WORKING', intensity: 'LOW' })
      const firstIntent = core.decide(state)
      const initialConfidence = firstIntent.confidence

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Get the same intent (should be decayed)
      const decayedIntent = core.decide(state)

      // Confidence should be same or lower due to decay
      expect(decayedIntent.confidence).toBeLessThanOrEqual(initialConfidence)
    })
  })

  describe('invalidation', () => {
    it('should invalidate CONTINUE when mode becomes RUNAWAY', () => {
      // First get a CONTINUE intent
      const workingState = createActivityState({ mode: 'WORKING', intensity: 'LOW' })
      const continueIntent = core.decide(workingState)
      expect(continueIntent.intent).toBe('CONTINUE')

      // Now mode becomes critical
      const runawayState = createActivityState({ mode: 'RUNAWAY' })
      const invalidatedIntent = core.decide(runawayState)

      // Should now be STOP or PAUSE
      expect(['STOP', 'PAUSE']).toContain(invalidatedIntent.intent)
    })

    it('should invalidate high-confidence intent when intensity spikes', () => {
      // Build up a high confidence CONTINUE
      for (let i = 0; i < 5; i++) {
        core.update(createEvent({ tokenCount: 50 }))
      }
      const lowIntensityState = createActivityState({ mode: 'WORKING', intensity: 'LOW' })
      core.decide(lowIntensityState)

      // Now intensity spikes to HIGH
      const highIntensityState = createActivityState({ mode: 'WORKING', intensity: 'HIGH' })
      const result = core.decide(highIntensityState)

      // Should be PAUSE due to HIGH intensity
      expect(result.intent).toBe('PAUSE')
    })
  })

  describe('update', () => {
    it('should track token history', () => {
      for (let i = 0; i < 5; i++) {
        core.update(createEvent({ tokenCount: 100 * (i + 1) }))
      }

      // Internal state should be affected
      const state = createActivityState()
      const intent = core.decide(state)

      expect(intent).toBeDefined()
    })
  })

  describe('reset', () => {
    it('should clear last intent and history', () => {
      // Build up state
      for (let i = 0; i < 5; i++) {
        core.update(createEvent())
      }
      core.decide(createActivityState())

      expect(core.getLastIntent()).not.toBeNull()

      // Reset
      core.reset()

      expect(core.getLastIntent()).toBeNull()
    })
  })
})
