/**
 * @tripwire/core tests
 */

import { describe, expect, it } from 'vitest'
import { HEALTH_THRESHOLDS, deepFreeze } from './index.js'

describe('@tripwire/core contracts', () => {
  describe('HEALTH_THRESHOLDS', () => {
    it('should have SOFT_SUSPEND > HARD_STOP', () => {
      expect(HEALTH_THRESHOLDS.SOFT_SUSPEND).toBeGreaterThan(HEALTH_THRESHOLDS.HARD_STOP)
    })

    it('should have RECOVERY_CAP < 1.0 (never fully heals)', () => {
      expect(HEALTH_THRESHOLDS.RECOVERY_CAP).toBeLessThan(1.0)
    })

    it('should have correct values from spec §4.1', () => {
      expect(HEALTH_THRESHOLDS.SOFT_SUSPEND).toBe(0.6)
      expect(HEALTH_THRESHOLDS.HARD_STOP).toBe(0.3)
      expect(HEALTH_THRESHOLDS.RECOVERY_RATE).toBe(0.01)
      expect(HEALTH_THRESHOLDS.RECOVERY_CAP).toBe(0.8)
    })
  })

  describe('deepFreeze', () => {
    it('should freeze nested objects', () => {
      const obj = { a: 1, nested: { b: 2 } }
      const frozen = deepFreeze(obj)

      expect(Object.isFrozen(frozen)).toBe(true)
      expect(Object.isFrozen(frozen.nested)).toBe(true)
    })
  })
})
