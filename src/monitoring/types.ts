/**
 * @tripwired/monitoring - Type definitions
 * FAZ 7: Drift detection types
 */

// =============================================================================
// DRIFT METRICS
// =============================================================================

export interface DriftMetrics {
  // Decision quality cluster
  vetoRate: number
  confidenceDistribution: {
    mean: number
    variance: number
  }

  // State stability cluster
  stateFlipFrequency: number
  chaoticRatio: number
  chaoticDuration: number

  // Execution cluster
  slippageTrend: number
  fillRatioMean: number
}

export interface BaselineWindow {
  startTime: number
  endTime: number
  metrics: DriftMetrics
  validationCriteria: {
    healthAboveNominal: boolean
    noChaoticState: boolean
    minimumDuration: boolean
  }
}

// =============================================================================
// DRIFT SIGNALS
// =============================================================================

export interface DriftSignals {
  decisionQuality: {
    vetoRateIncreasing: boolean
    confidenceDegrading: boolean
  }

  stateStability: {
    flipAccelerating: boolean
    chaoticExcessive: boolean
  }

  execution: {
    slippageDeteriorating: boolean
    fillRateDropping: boolean
  }
}

// =============================================================================
// SYSTEM STATE
// =============================================================================

export enum SystemState {
  RUNNING = 'RUNNING',
  SUSPENDED = 'SUSPENDED',
  STOPPED = 'STOPPED',
  QUARANTINE = 'QUARANTINE',
}

export enum ShutdownReason {
  DRIFT_DETECTED = 'DRIFT_DETECTED',
  HEALTH_CRITICAL = 'HEALTH_CRITICAL',
  MANUAL_OVERRIDE = 'MANUAL_OVERRIDE',
}

// =============================================================================
// TELEMETRY
// =============================================================================

export interface ContributingMetric {
  metric: string
  baseline: number
  current: number
  deviation: number
}

export interface ActiveDriftSignal {
  cluster: 'decisionQuality' | 'stateStability' | 'execution'
  signal: string
  contributingMetrics: ContributingMetric[]
}

export interface ShutdownEvent {
  reason: ShutdownReason
  timestamp: number
  triggeringSignals: string[]
}

export interface TelemetrySnapshot {
  timestamp: number
  systemState: SystemState
  metrics: DriftMetrics
  baseline: DriftMetrics | null
  activeDriftSignals: ActiveDriftSignal[]
  shutdownHistory: ShutdownEvent[]
}
