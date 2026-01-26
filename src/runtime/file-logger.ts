/**
 * @tripwired/runtime - File Logger
 * Export Pipeline events to JSON file for telemetry
 */

import { appendFileSync, mkdirSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { SystemEvent } from '../core/types.js'

export class FileLogger {
  private buffer: SystemEvent[] = []
  private readonly flushThreshold: number

  constructor(
    private readonly outputPath: string,
    options: { flushThreshold?: number } = {},
  ) {
    this.flushThreshold = options.flushThreshold ?? 100

    // Create output directory if it doesn't exist
    const dir = dirname(outputPath)
    try {
      mkdirSync(dir, { recursive: true })
    } catch {
      // Directory already exists
    }

    // Initialize with empty array (or append mode)
    try {
      writeFileSync(outputPath, '', { flag: 'a' })
    } catch (error) {
      console.error(`FileLogger: Failed to initialize ${outputPath}:`, error)
    }
  }

  /**
   * Log a system event
   * Events are buffered and flushed when threshold is reached
   */
  log(event: SystemEvent): void {
    this.buffer.push(event)

    if (this.buffer.length >= this.flushThreshold) {
      this.flush()
    }
  }

  /**
   * Flush buffered events to file
   * Each event is written as a JSON line (JSONL format)
   */
  flush(): void {
    if (this.buffer.length === 0) {
      return
    }

    try {
      // Write each event as a separate JSON line (JSONL)
      const lines = this.buffer.map((event) => JSON.stringify(event)).join('\n') + '\n'
      appendFileSync(this.outputPath, lines, 'utf-8')
      this.buffer = []
    } catch (error) {
      console.error(`FileLogger: Failed to flush to ${this.outputPath}:`, error)
    }
  }

  /**
   * Get current buffer size
   */
  getBufferSize(): number {
    return this.buffer.length
  }

  /**
   * Clear buffer without flushing
   */
  clear(): void {
    this.buffer = []
  }
}
