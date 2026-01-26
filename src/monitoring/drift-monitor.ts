/**
 * @tripwire/monitoring - DriftMonitor
 * FAZ 7: Production-grade drift detection
 *
 * Key principles:
 * - Baseline from stable periods only
 * - Independent signal clusters
 * - QUARANTINE state for post-shutdown recovery
 */

import type {
  ActiveDriftSignal,
  BaselineWindow,
  ContributingMetric,
  DriftMetrics,
  DriftSignals,
  ShutdownEvent,
  SystemState,
  TelemetrySnapshot
} from './types.js';
import { ShutdownReason, SystemState as State } from './types.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const DRIFT_CONFIG = {
  // Baseline validation
  BASELINE_MIN_DURATION_MS: 30 * 60 * 1000, // 30 minutes
  BASELINE_HEALTH_THRESHOLD: 0.8,

  // Drift thresholds
  VETO_RATE_INCREASE_THRESHOLD: 0.2, // 20% increase
  CONFIDENCE_MEAN_DROP_THRESHOLD: 0.1,
  CONFIDENCE_VARIANCE_INCREASE_THRESHOLD: 0.05,
  STATE_FLIP_ACCELERATION_RATIO: 1.5, // 50% faster
  CHAOTIC_RATIO_THRESHOLD: 0.4, // 40% of time
  CHAOTIC_MIN_DURATION_MS: 10 * 60 * 1000, // 10 minutes uninterrupted

  // Shutdown timing
  DRIFT_WARNING_DURATION_MS: 60 * 60 * 1000, // 1 hour
  DRIFT_SUSPEND_DURATION_MS: 2 * 60 * 60 * 1000, // 2 hours
  QUARANTINE_MIN_DURATION_MS: 60 * 60 * 1000, // 1 hour

  // Rolling windows
  METRICS_WINDOW_MS: 60 * 60 * 1000, // 1 hour
  TELEMETRY_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
} as const;

// =============================================================================
// DRIFT MONITOR
// =============================================================================

export class DriftMonitor {
  private baseline: BaselineWindow | null = null;
  private currentMetrics: DriftMetrics;
  private systemState: SystemState = State.RUNNING;
  private shutdownHistory: ShutdownEvent[] = [];

  // Baseline collection state
  private baselineCollectionStart: number | null = null;
  private baselineHealthAboveNominal = true;
  private baselineHadChaotic = false;

  // Drift tracking
  private driftDetectedAt: number | null = null;
  private quarantineEnteredAt: number | null = null;

  constructor() {
    this.currentMetrics = this.createEmptyMetrics();
  }

  /**
   * Record decision event for drift tracking
   */
  recordDecision(params: {
    wasVetoed: boolean;
    confidence: number;
    timestamp: number;
  }): void {
    // Update metrics...
    // (Implementation will track rolling window)
  }

  /**
   * Record state transition for stability tracking
   */
  recordStateTransition(params: {
    from: string;
    to: string;
    timestamp: number;
  }): void {
    // Update state flip frequency
    // Track CHAOTIC duration
  }

  /**
   * Record health change for baseline validation
   */
  recordHealthChange(params: {
    health: number;
    timestamp: number;
  }): void {
    const isAboveNominal = params.health >= DRIFT_CONFIG.BASELINE_HEALTH_THRESHOLD;

    // If collecting baseline and health drops, invalidate
    if (this.baselineCollectionStart !== null && !isAboveNominal) {
      this.baselineHealthAboveNominal = false;
    }
  }

  /**
   * Record execution result for execution cluster
   */
  recordExecution(params: {
    slippage: number;
    fillRatio: number;
    timestamp: number;
  }): void {
    // Update execution metrics
  }

  /**
   * Check if baseline collection should start or continue
   */
  private updateBaselineCollection(now: number): void {
    // Start collection if no baseline and system stable
    if (this.baseline === null && this.baselineCollectionStart === null) {
      if (this.baselineHealthAboveNominal && !this.baselineHadChaotic) {
        this.baselineCollectionStart = now;
      }
    }

    // Check if baseline window is complete
    if (this.baselineCollectionStart !== null) {
      const duration = now - this.baselineCollectionStart;

      if (duration >= DRIFT_CONFIG.BASELINE_MIN_DURATION_MS) {
        // Validate baseline criteria
        if (this.baselineHealthAboveNominal && !this.baselineHadChaotic) {
          this.baseline = {
            startTime: this.baselineCollectionStart,
            endTime: now,
            metrics: { ...this.currentMetrics },
            validationCriteria: {
              healthAboveNominal: true,
              noChaoticState: true,
              minimumDuration: true,
            },
          };
        }

        // Reset collection state
        this.baselineCollectionStart = null;
        this.baselineHealthAboveNominal = true;
        this.baselineHadChaotic = false;
      }
    }
  }

  /**
   * Detect drift signals from independent clusters
   */
  private detectDriftSignals(now: number): DriftSignals {
    if (this.baseline === null) {
      // No baseline yet, can't detect drift
      return this.createEmptySignals();
    }

    const base = this.baseline.metrics;
    const curr = this.currentMetrics;

    return {
      decisionQuality: {
        vetoRateIncreasing:
          curr.vetoRate > base.vetoRate * (1 + DRIFT_CONFIG.VETO_RATE_INCREASE_THRESHOLD),
        confidenceDegrading:
          curr.confidenceDistribution.mean < base.confidenceDistribution.mean - DRIFT_CONFIG.CONFIDENCE_MEAN_DROP_THRESHOLD &&
          curr.confidenceDistribution.variance > base.confidenceDistribution.variance + DRIFT_CONFIG.CONFIDENCE_VARIANCE_INCREASE_THRESHOLD,
      },

      stateStability: {
        flipAccelerating:
          curr.stateFlipFrequency > base.stateFlipFrequency * DRIFT_CONFIG.STATE_FLIP_ACCELERATION_RATIO,
        chaoticExcessive:
          curr.chaoticRatio > DRIFT_CONFIG.CHAOTIC_RATIO_THRESHOLD &&
          curr.chaoticDuration >= DRIFT_CONFIG.CHAOTIC_MIN_DURATION_MS,
      },

      execution: {
        slippageDeteriorating: curr.slippageTrend > base.slippageTrend * 1.5,
        fillRateDropping: curr.fillRatioMean < base.fillRatioMean * 0.8,
      },
    };
  }

  /**
   * Count active drift signals across clusters
   */
  private countActiveClusters(signals: DriftSignals): number {
    let activeClusters = 0;

    if (signals.decisionQuality.vetoRateIncreasing || signals.decisionQuality.confidenceDegrading) {
      activeClusters++;
    }

    if (signals.stateStability.flipAccelerating || signals.stateStability.chaoticExcessive) {
      activeClusters++;
    }

    if (signals.execution.slippageDeteriorating || signals.execution.fillRateDropping) {
      activeClusters++;
    }

    return activeClusters;
  }

  /**
   * Update system state based on drift detection
   */
  tick(now: number): void {
    // Update baseline collection
    this.updateBaselineCollection(now);

    // Detect drift
    const signals = this.detectDriftSignals(now);
    const activeClusters = this.countActiveClusters(signals);

    // State transitions
    if (this.systemState === State.RUNNING) {
      if (activeClusters >= 2) {
        if (this.driftDetectedAt === null) {
          this.driftDetectedAt = now;
        }

        const driftDuration = now - this.driftDetectedAt;

        if (driftDuration >= DRIFT_CONFIG.DRIFT_SUSPEND_DURATION_MS) {
          this.enterStopped(now, signals);
        } else if (driftDuration >= DRIFT_CONFIG.DRIFT_WARNING_DURATION_MS) {
          this.enterSuspended(now);
        }
      } else {
        // Drift cleared
        this.driftDetectedAt = null;
      }
    } else if (this.systemState === State.QUARANTINE) {
      // Check if quarantine can be exited (requires manual approval)
      const quarantineDuration = this.quarantineEnteredAt !== null ? now - this.quarantineEnteredAt : 0;

      if (quarantineDuration >= DRIFT_CONFIG.QUARANTINE_MIN_DURATION_MS) {
        // Eligible for manual approval
        // (Actual approval logic external)
      }
    }
  }

  /**
   * Get current system state
   */
  getState(): SystemState {
    return this.systemState;
  }

  /**
   * Get telemetry snapshot
   */
  getTelemetry(now: number): TelemetrySnapshot {
    const signals = this.detectDriftSignals(now);
    const activeDriftSignals = this.buildActiveDriftSignals(signals);

    return {
      timestamp: now,
      systemState: this.systemState,
      metrics: { ...this.currentMetrics },
      baseline: this.baseline !== null ? { ...this.baseline.metrics } : null,
      activeDriftSignals,
      shutdownHistory: [...this.shutdownHistory],
    };
  }

  /**
   * Manual approval to exit QUARANTINE
   */
  approveQuarantineExit(): void {
    if (this.systemState === State.QUARANTINE) {
      this.systemState = State.RUNNING;
      this.driftDetectedAt = null;
      this.quarantineEnteredAt = null;
    }
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private enterSuspended(now: number): void {
    this.systemState = State.SUSPENDED;
  }

  private enterStopped(now: number, signals: DriftSignals): void {
    const triggeringSignals = this.extractTriggeringSignals(signals);

    this.shutdownHistory.push({
      reason: ShutdownReason.DRIFT_DETECTED,
      timestamp: now,
      triggeringSignals,
    });

    this.systemState = State.STOPPED;

    // Enter QUARANTINE immediately after STOPPED
    this.enterQuarantine(now);
  }

  private enterQuarantine(now: number): void {
    this.systemState = State.QUARANTINE;
    this.quarantineEnteredAt = now;

    // Reset baseline for recalculation
    this.baseline = null;
    this.baselineCollectionStart = null;
  }

  private buildActiveDriftSignals(signals: DriftSignals): ActiveDriftSignal[] {
    const active: ActiveDriftSignal[] = [];

    // Decision quality cluster
    if (signals.decisionQuality.vetoRateIncreasing) {
      active.push(this.buildSignal('decisionQuality', 'vetoRateIncreasing', [
        this.buildContributingMetric('vetoRate'),
      ]));
    }

    if (signals.decisionQuality.confidenceDegrading) {
      active.push(this.buildSignal('decisionQuality', 'confidenceDegrading', [
        this.buildContributingMetric('confidenceMean'),
        this.buildContributingMetric('confidenceVariance'),
      ]));
    }

    // State stability cluster
    if (signals.stateStability.flipAccelerating) {
      active.push(this.buildSignal('stateStability', 'flipAccelerating', [
        this.buildContributingMetric('stateFlipFrequency'),
      ]));
    }

    if (signals.stateStability.chaoticExcessive) {
      active.push(this.buildSignal('stateStability', 'chaoticExcessive', [
        this.buildContributingMetric('chaoticRatio'),
        this.buildContributingMetric('chaoticDuration'),
      ]));
    }

    // Execution cluster
    if (signals.execution.slippageDeteriorating) {
      active.push(this.buildSignal('execution', 'slippageDeteriorating', [
        this.buildContributingMetric('slippageTrend'),
      ]));
    }

    if (signals.execution.fillRateDropping) {
      active.push(this.buildSignal('execution', 'fillRateDropping', [
        this.buildContributingMetric('fillRatioMean'),
      ]));
    }

    return active;
  }

  private buildSignal(
    cluster: 'decisionQuality' | 'stateStability' | 'execution',
    signal: string,
    metrics: ContributingMetric[]
  ): ActiveDriftSignal {
    return { cluster, signal, contributingMetrics: metrics };
  }

  private buildContributingMetric(metric: string): ContributingMetric {
    // Extract baseline and current values
    // (Simplified for now)
    return {
      metric,
      baseline: 0,
      current: 0,
      deviation: 0,
    };
  }

  private extractTriggeringSignals(signals: DriftSignals): string[] {
    const triggering: string[] = [];

    if (signals.decisionQuality.vetoRateIncreasing) triggering.push('vetoRateIncreasing');
    if (signals.decisionQuality.confidenceDegrading) triggering.push('confidenceDegrading');
    if (signals.stateStability.flipAccelerating) triggering.push('flipAccelerating');
    if (signals.stateStability.chaoticExcessive) triggering.push('chaoticExcessive');
    if (signals.execution.slippageDeteriorating) triggering.push('slippageDeteriorating');
    if (signals.execution.fillRateDropping) triggering.push('fillRateDropping');

    return triggering;
  }

  private createEmptyMetrics(): DriftMetrics {
    return {
      vetoRate: 0,
      confidenceDistribution: { mean: 0, variance: 0 },
      stateFlipFrequency: 0,
      chaoticRatio: 0,
      chaoticDuration: 0,
      slippageTrend: 0,
      fillRatioMean: 0,
    };
  }

  private createEmptySignals(): DriftSignals {
    return {
      decisionQuality: {
        vetoRateIncreasing: false,
        confidenceDegrading: false,
      },
      stateStability: {
        flipAccelerating: false,
        chaoticExcessive: false,
      },
      execution: {
        slippageDeteriorating: false,
        fillRateDropping: false,
      },
    };
  }
}
