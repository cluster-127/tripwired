# tripwire — Master Specification

**Version**: v0.2
**Date**: 2026-01-26
**Status**: FROZEN (code must comply with this spec)

---

## 1. System Philosophy

### 1.1 Ontological Boundaries

This system adopts the following assumptions as constitutional:

1. This system does **not have certain knowledge** about agent outputs.
2. This system accepts that agent behaviors **will degrade over time**.
3. For this system, **stopping** is as valid a decision as continuing.

These assumptions are not slogans; every line of code written is subject to them.

### 1.2 Authority Model

#### The system CAN decide:

- Action intent (CONTINUE / PAUSE / STOP)
- Activity intensity assessment (LOW / NORMAL / HIGH)
- To stop or suspend its own operation

#### The system CANNOT decide:

- To assume the agent is producing correct output
- To allow unlimited or uncontrolled token consumption
- To bypass SafetyGate or safety layers
- To modify its own rules at runtime

### 1.3 Failure Definition

#### NOT considered failure:

- Agent failing to produce expected output
- Extended periods of no activity
- Token budget exhaustion

#### Considered failure:

- Producing unexplainable or untraceable decisions
- Violating defined safety boundaries
- Continuing to operate when the system should have stopped

### 1.4 Design Priorities

Priority order (immutable):

1. Controllability
2. Explainability
3. Survival
4. Performance

Agent success is the **result** of these priorities, not the goal.

---

## 2. Module Architecture

### 2.1 Global Contracts (Types)

```typescript
interface AgentEvent {
  timestamp: number // monotonic
  tokenCount: number // tokens consumed in this event
  toolCalls: number // number of tool calls in this event
  latencyMs: number // response time
  outputLength: number // output character count
  outputHash?: string // hash for loop detection
}

interface ActivityState {
  intensity: 'LOW' | 'NORMAL' | 'HIGH'
  mode: 'IDLE' | 'WORKING' | 'LOOPING' | 'RUNAWAY'
  reason: string // mandatory, cannot be empty
  since: number
}

interface IntentDecision {
  intent: 'CONTINUE' | 'PAUSE' | 'STOP'
  confidence: number // [0.0 - 1.0]
  reason: string
}

interface SafetyDecision {
  allowed: boolean
  remainingBudget: number
  reason: string
  vetoReason?: SafetyVeto
}

interface ExecutionResult {
  executed: boolean
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'BLOCKED'
  tokensUsed: number
  latencyMs: number
}

type SafetyVeto =
  | 'RUNAWAY_DETECTED'
  | 'LOOP_DETECTED'
  | 'TOKEN_BUDGET_EXCEEDED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'COOLDOWN_ACTIVE'
  | 'HEALTH_DEGRADED'
```

### 2.2 Module Responsibilities

| Module           | Input                           | Output               | Constraint                        |
| ---------------- | ------------------------------- | -------------------- | --------------------------------- |
| AgentEventSource | LLM API                         | AgentEvent           | Data only, no interpretation      |
| ActivityEngine   | AgentEvent stream               | ActivityState stream | Deterministic, infrequent changes |
| IntentCore       | ActivityState                   | IntentDecision       | Default = CONTINUE                |
| SafetyGate       | IntentDecision + internal state | SafetyDecision       | Single authoritative gate         |
| ExecutionAdapter | SafetyDecision (allowed=true)   | ExecutionResult      | Mechanical, not intelligent       |

### 2.3 Event Flow

```
AgentEventSource
  → AgentEvent
    → ActivityEngine
      → ActivityState
        → IntentCore
          → IntentDecision
            → SafetyGate
              → SafetyDecision
                → ExecutionAdapter
                    → ExecutionResult
                        ↓
                    [Feedback to SafetyGate]
```

This chain is unidirectional. No module can attempt to "convince upstream."

---

## 3. Activity Modes

### 3.1 Mode Definitions

| Mode    | Definition                 | Trigger                                   |
| ------- | -------------------------- | ----------------------------------------- |
| IDLE    | No activity                | No event for 30+ seconds                  |
| WORKING | Normal productive activity | Regular, controlled event flow            |
| LOOPING | Repetitive output/behavior | Output similarity > 0.9 for last 5 events |
| RUNAWAY | Uncontrolled acceleration  | Tempo compression ratio < 0.3             |

### 3.2 Mode Transition Rules

- Modes do not change frequently (minimum 10 second constraint)
- LOOPING/RUNAWAY → other mode transitions require longer duration (3x)
- Every state output must include `reason`

---

## 4. SafetyGate Controls

### 4.1 Token Budget

| Parameter                 | Value  | Description           |
| ------------------------- | ------ | --------------------- |
| `MAX_TOKENS_PER_MINUTE`   | 50,000 | Max tokens per minute |
| `TOKEN_WARNING_THRESHOLD` | 40,000 | Warning threshold     |

### 4.2 API Rate Limiting

| Parameter                     | Value | Description               |
| ----------------------------- | ----- | ------------------------- |
| `MAX_TOOL_CALLS_PER_MINUTE`   | 60    | Max tool calls per minute |
| `TOOL_CALL_WARNING_THRESHOLD` | 45    | Warning threshold         |

### 4.3 Behavioral Control

| Parameter                   | Value  | Description                         |
| --------------------------- | ------ | ----------------------------------- |
| `LOOP_SIMILARITY_THRESHOLD` | 0.9    | Loop detection similarity threshold |
| `LOOP_WINDOW_SIZE`          | 5      | Comparison window                   |
| `TEMPO_COMPRESSION_RATIO`   | 0.3    | Runaway detection ratio             |
| `COOLDOWN_DURATION_MS`      | 60,000 | Wait time after veto                |

### 4.4 Veto Priorities (immutable)

1. **RUNAWAY_DETECTED** → Agent accelerating uncontrollably
2. **LOOP_DETECTED** → Agent entered a loop
3. **TOKEN_BUDGET_EXCEEDED** → Token limit reached
4. **RATE_LIMIT_EXCEEDED** → API call rate exceeded
5. **COOLDOWN_ACTIVE** → Wait period ongoing
6. **HEALTH_DEGRADED** → System health low

---

## 5. System Health Model

### 5.1 Health Thresholds

| Parameter                | Value       | Description                                 |
| ------------------------ | ----------- | ------------------------------------------- |
| `SOFT_SUSPEND_THRESHOLD` | 0.6         | Agent paused, human intervention suggested  |
| `HARD_STOP_THRESHOLD`    | 0.3         | All activity stops, manual restart required |
| `RECOVERY_RATE`          | 0.01/minute | Recovery rate per minute                    |
| `RECOVERY_CAP`           | 0.8         | Max recovery level (no full healing)        |

### 5.2 Health Degradation Triggers

- LOOPING or RUNAWAY mode detection
- Execution error (timeout, error)
- Unexpected mode flips
- Consecutive failed tool calls

### 5.3 Shutdown Types

| Type         | Health | Behavior                                    |
| ------------ | ------ | ------------------------------------------- |
| Soft Suspend | < 0.6  | Agent paused, human notification            |
| Hard Stop    | < 0.3  | All activity stops, manual restart required |

---

## 6. Operational Rules

### 6.1 ALLOWED Adaptations

1. **Intensity threshold adjustment**: Dynamic threshold via rolling average
2. **Dynamic token budget tightening**: Budget decreases as health drops
3. **Loop detection sensitivity adjustment**: Threshold based on error rate

### 6.2 NOT ALLOWED

- Changing intent logic
- Changing confidence formula
- SafetyGate bypass (under any circumstances)
- Runtime health threshold changes

---

## 7. Replay Parity

**Purpose**: Verify system determinism.

**Mechanism**:

1. All AgentEvents are hashed with SHA-256
2. Decision sequence (IntentDecision + SafetyDecision) is separately hashed
3. Hash comparison at end of replay

**Verification**:

```
Live Run Hash == Replay Hash → Determinism OK
Live Run Hash != Replay Hash → Non-determinism Bug → INVESTIGATE
```

---

## Appendix

### A. Change Log

| Version | Date       | Change                                |
| ------- | ---------- | ------------------------------------- |
| v0.1    | 2026-01-26 | Initial frozen spec (trading context) |
| v0.2    | 2026-01-26 | LLM Agent Kill-Switch pivot           |

### B. v0.1 → v0.2 Terminology Changes

| v0.1 (Trading)  | v0.2 (Agent)   |
| --------------- | -------------- |
| MarketEvent     | AgentEvent     |
| MarketState     | ActivityState  |
| StateEngine     | ActivityEngine |
| DecisionCore    | IntentCore     |
| RiskEngine      | SafetyGate     |
| VetoReason      | SafetyVeto     |
| exposure        | token budget   |
| trade frequency | API rate       |

### C. References

- `docs/design.md`: System design contract
- `SHADOW_PITCH.md`: v0.2 pivot rationale

---

**This document is frozen as v0.2. Code must comply with this spec.**
