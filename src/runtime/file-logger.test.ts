/**
 * Tripwire FileLogger Tests - v0.2
 */

import { existsSync, readFileSync, rmSync } from 'fs'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentEvent, SystemEvent } from '../core/types.js'
import { FileLogger } from './file-logger.js'

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createAgentEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    timestamp: Date.now(),
    tokenCount: 500,
    toolCalls: 1,
    latencyMs: 100,
    outputLength: 200,
    ...overrides,
  }
}

// =============================================================================
// TESTS
// =============================================================================

describe('FileLogger', () => {
  const testOutputPath = './test-logs/events.jsonl'

  afterEach(() => {
    try {
      rmSync('./test-logs', { recursive: true, force: true })
    } catch {
      // Ignore errors
    }
  })

  it('should create output directory if it does not exist', () => {
    new FileLogger(testOutputPath)
    expect(existsSync('./test-logs')).toBe(true)
  })

  it('should buffer events until threshold', () => {
    const logger = new FileLogger(testOutputPath, { flushThreshold: 5 })

    const event: SystemEvent = {
      type: 'AGENT_EVENT',
      event: createAgentEvent(),
    }

    logger.log(event)
    logger.log(event)
    logger.log(event)

    expect(logger.getBufferSize()).toBe(3)

    const content = readFileSync(testOutputPath, 'utf-8')
    expect(content.trim()).toBe('')
  })

  it('should flush when threshold is reached', () => {
    const logger = new FileLogger(testOutputPath, { flushThreshold: 3 })

    const event: SystemEvent = {
      type: 'AGENT_EVENT',
      event: createAgentEvent(),
    }

    logger.log(event)
    logger.log(event)
    logger.log(event)

    expect(logger.getBufferSize()).toBe(0)

    const content = readFileSync(testOutputPath, 'utf-8')
    const lines = content.trim().split('\n')
    expect(lines.length).toBe(3)

    lines.forEach((line) => {
      if (line) {
        expect(() => JSON.parse(line)).not.toThrow()
      }
    })
  })

  it('should write events in JSONL format', () => {
    const logger = new FileLogger(testOutputPath, { flushThreshold: 1 })

    const event1: SystemEvent = {
      type: 'AGENT_EVENT',
      event: createAgentEvent({ timestamp: 1000 }),
    }
    const event2: SystemEvent = {
      type: 'AGENT_EVENT',
      event: createAgentEvent({ timestamp: 2000 }),
    }

    logger.log(event1)
    logger.log(event2)

    const content = readFileSync(testOutputPath, 'utf-8')
    const lines = content.trim().split('\n')

    expect(lines.length).toBe(2)
    expect(JSON.parse(lines[0]!)).toEqual(event1)
    expect(JSON.parse(lines[1]!)).toEqual(event2)
  })

  it('should flush on demand', () => {
    const logger = new FileLogger(testOutputPath, { flushThreshold: 100 })

    const event: SystemEvent = {
      type: 'AGENT_EVENT',
      event: createAgentEvent(),
    }

    logger.log(event)
    logger.log(event)
    logger.flush()

    expect(logger.getBufferSize()).toBe(0)

    const content = readFileSync(testOutputPath, 'utf-8')
    const lines = content.trim().split('\n')
    expect(lines.length).toBe(2)
  })

  it('should handle multiple event types', () => {
    const logger = new FileLogger(testOutputPath, { flushThreshold: 10 })

    const events: SystemEvent[] = [
      { type: 'AGENT_EVENT', event: createAgentEvent() },
      {
        type: 'INTENT',
        intent: { intent: 'CONTINUE', confidence: 0.8, reason: 'Test', timestamp: 1000 },
        decision: { allowed: true, remainingBudget: 1000, reason: 'Test', timestamp: 1000 },
      },
      { type: 'ERROR', component: 'TestComponent', error: 'Test error' },
    ]

    events.forEach((e) => logger.log(e))
    logger.flush()

    const content = readFileSync(testOutputPath, 'utf-8')
    const lines = content.trim().split('\n')

    expect(lines.length).toBe(3)
    expect(JSON.parse(lines[0]!).type).toBe('AGENT_EVENT')
    expect(JSON.parse(lines[1]!).type).toBe('INTENT')
    expect(JSON.parse(lines[2]!).type).toBe('ERROR')
  })

  it('should clear buffer without flushing', () => {
    const logger = new FileLogger(testOutputPath, { flushThreshold: 100 })

    const event: SystemEvent = {
      type: 'AGENT_EVENT',
      event: createAgentEvent(),
    }

    logger.log(event)
    logger.log(event)

    expect(logger.getBufferSize()).toBe(2)

    logger.clear()

    expect(logger.getBufferSize()).toBe(0)

    const content = readFileSync(testOutputPath, 'utf-8')
    expect(content.trim()).toBe('')
  })
})
