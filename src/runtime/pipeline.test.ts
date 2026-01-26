/**
 * Tripwired Pipeline Tests - v0.2
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { AgentEvent } from '../core/types.js'
import { Pipeline } from './pipeline.js'

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    timestamp: Date.now(),
    tokenCount: 500,
    toolCalls: 1,
    latencyMs: 100,
    outputLength: 200,
    ...overrides,
  }
}

function generateEvents(count: number): AgentEvent[] {
  return Array.from({ length: count }, (_, i) =>
    createEvent({
      timestamp: 1000000 + i * 1000,
      tokenCount: 500 + (i % 10) * 50,
      toolCalls: (i % 3) + 1,
      latencyMs: 100 + (i % 5) * 20,
      outputLength: 200 + i * 10,
    }),
  )
}

// =============================================================================
// TESTS
// =============================================================================

describe('Pipeline', () => {
  let pipeline: Pipeline

  beforeEach(() => {
    pipeline = new Pipeline()
  })

  describe('process', () => {
    it('should return all pipeline outputs', async () => {
      const event = createEvent()
      const result = await pipeline.process(event)

      expect(result.state).toBeDefined()
      expect(result.intent).toBeDefined()
      expect(result.decision).toBeDefined()
      expect(result.result).toBeDefined()
    })

    it('should always block by default (SafetyGate)', async () => {
      const event = createEvent()
      const result = await pipeline.process(event)

      expect(result.result.executed).toBe(false)
    })
  })

  describe('run', () => {
    it('should process multiple events', async () => {
      const events = generateEvents(10)
      const result = await pipeline.run(events)

      expect(result.events.length).toBeGreaterThan(0)
      expect(result.hash).toBeDefined()
      expect(result.hash.length).toBe(64) // SHA-256 hex
    })
  })

  describe('replay parity', () => {
    it('should produce consistent intents for identical input', async () => {
      const events = generateEvents(20)

      const pipeline1 = new Pipeline()
      const intents1: string[] = []
      for (const event of events) {
        const r = await pipeline1.process(event)
        intents1.push(r.intent.intent)
      }

      const pipeline2 = new Pipeline()
      const intents2: string[] = []
      for (const event of events) {
        const r = await pipeline2.process(event)
        intents2.push(r.intent.intent)
      }

      expect(intents1).toEqual(intents2)
    })

    it('should produce different hash for different input', async () => {
      const events1 = generateEvents(20)
      const events2 = generateEvents(20).map((e) => ({
        ...e,
        tokenCount: e.tokenCount + 100,
      }))

      const pipeline1 = new Pipeline()
      const result1 = await pipeline1.run(events1)

      const pipeline2 = new Pipeline()
      const result2 = await pipeline2.run(events2)

      expect(result1.hash).not.toBe(result2.hash)
    })
  })

  describe('health tracking', () => {
    it('should expose health state', () => {
      const health = pipeline.getHealth()

      expect(health.status).toBe('HEALTHY')
      expect(health.score).toBe(1.0)
    })
  })

  describe('reset', () => {
    it('should reset components to initial state', async () => {
      const events = generateEvents(5)
      for (const event of events) {
        await pipeline.process(event)
      }

      pipeline.reset()

      const health = pipeline.getHealth()
      expect(health.status).toBe('HEALTHY')
      expect(health.score).toBe(1.0)
    })
  })

  describe('graceful degradation under chaos', () => {
    it('should not double-panic when mode is RUNAWAY + execution error', async () => {
      const mockAdapter = {
        async execute() {
          throw new Error('Execution error: mock failure')
        },
      }

      const pipeline = new Pipeline({ adapter: mockAdapter as any })

      const events = generateEvents(10).map((e, i) => ({
        ...e,
        tokenCount: i % 2 === 0 ? 5000 : 100,
        toolCalls: i % 2 === 0 ? 10 : 1,
      }))

      for (const event of events) {
        const result = await pipeline.process(event)

        expect(result.state).toBeDefined()
        expect(result.decision).toBeDefined()
        expect(result.result.executed).toBe(false)
      }

      const health = pipeline.getHealth()
      expect(health.status).toBeDefined()
    })

    it('should skip execution when decision not allowed (invariant)', async () => {
      let executeCalled = false
      const mockAdapter = {
        async execute() {
          executeCalled = true
          return {
            executed: false,
            status: 'BLOCKED' as const,
            tokensUsed: 0,
            latencyMs: 0,
            timestamp: Date.now(),
          }
        },
      }

      const pipeline = new Pipeline({ adapter: mockAdapter as any })

      const events = generateEvents(50)

      for (const event of events) {
        const result = await pipeline.process(event)

        if (!result.decision.allowed) {
          expect(executeCalled).toBe(false)
        }

        executeCalled = false
      }
    })
  })
})
