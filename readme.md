# TRIPWIRE

**Behavioral control kernel for autonomous AI agents**

---

## What is Tripwire?

**Tripwire is not an AI agent framework.**
It is a behavioral control kernel designed to observe autonomous AI agents and determine **when they should stop acting**.

Tripwire does not generate strategies, optimize outcomes, or execute actions.
It monitors behavior over time, detects loss of control, and triggers **early, explainable intervention**.

Autonomous agents rarely fail because of a single bad decision.
They fail because they **continue acting after they should have stopped**.

Tripwire exists to catch that moment.

---

## What Tripwire is NOT

Tripwire is intentionally narrow in scope.

It is **not**:

- an AI agent framework
- an optimization tool
- a prompt engineering library
- an execution engine
- a platform or workflow orchestrator

Tripwire does not tell agents **what to do**.
It tells them **when to stop**.

---

## Core Idea

Tripwire treats autonomous behavior as a signal, not outcomes.

Instead of asking:

- "Is this output correct?"
- "Is this optimal?"

Tripwire asks:

- "Is control degrading?"
- "Is behavior accelerating?"
- "Are anomalies accumulating?"
- "Should this agent continue acting?"

When the answer becomes uncertain, Tripwire intervenes early.

---

## How Tripwire Works

Tripwire operates as a deterministic decision pipeline:

```
AgentEvent
  → ActivityState (IDLE / WORKING / LOOPING / RUNAWAY)
    → IntentDecision (CONTINUE / PAUSE / STOP)
      → SafetyDecision (allowed / veto)
        → Intervention Signal
```

Key signals Tripwire monitors:

- **Token acceleration**: Token consumption rate increasing faster than expected
- **Tempo compression**: Decisions occurring at increasing frequency
- **Loop detection**: Repetitive output patterns (similarity > 90%)
- **Health degradation**: Execution quality declining over time

These are **behavioral anomalies**, not content judgments.

Key properties:

- **Behavior-first**: evaluates patterns, not content
- **Deterministic**: same input always produces the same decision
- **Explainable**: every intervention has a primary reason
- **Conservative by design**: early stop is preferred over late recovery

---

## Intervention Model

Tripwire supports two forms of intervention:

- **Soft suspend (PAUSE)**
  New actions are blocked while observation continues.

- **Hard stop (STOP)**
  The agent is halted and requires manual reactivation.

Intervention decisions are driven by a health model that degrades based on
behavioral anomalies, not single events.

---

## Deployment Modes

### Shadow Mode

- Observes a live agent
- Produces intervention signals
- Does **not** enforce them

Used for: validation, post-mortem analysis, pilot deployments

### Embedded Gate

- Integrated directly into the decision path
- Enforces PAUSE / STOP signals

Used for: production control, safety-critical automation

### Replay / Post-Mortem

- Runs deterministically on historical data
- Answers: _"When should this agent have stopped?"_

---

## Design Philosophy

Tripwire is built around the following principles:

- **Early stop > late recovery**
- **Behavior > outcome**
- **Stability > performance**
- **Determinism > adaptivity**
- **Explainability > cleverness**

False positives are acceptable—stopping unnecessarily is recoverable.
Silent failure is not—continuing when you should have stopped is irreversible.

---

## Where Tripwire Fits

Tripwire is designed for any system that:

- acts autonomously
- operates continuously
- lacks a reliable internal stop condition

Primary use cases:

- **LLM Agent frameworks** (CrewAI, Langchain, Autogen)
- **Autonomous coding agents**
- **Customer service bots**
- **Research automation pipelines**
- **Any AI system with API costs at risk**

---

## Quick Start

### Install

```bash
pnpm install
```

### Run Tests

```bash
pnpm test    # 32 tests
```

### Project Structure

```
src/
├── core/              # Types and contracts
│   ├── types.ts       # AgentEvent, ActivityState, SafetyDecision
│   └── contracts.ts   # SAFETY_GATE_CONFIG
├── activity-engine/   # IDLE / WORKING / LOOPING / RUNAWAY detection
├── intent-core/       # CONTINUE / PAUSE / STOP logic
├── safety-gate/       # Token budget, API rate, veto decisions
├── execution/         # Execution adapter interface
├── monitoring/        # DriftMonitor
└── runtime/           # Pipeline orchestration
```

### Key Configuration

```typescript
// SAFETY_GATE_CONFIG
MAX_TOKENS_PER_MINUTE: 50_000
MAX_TOOL_CALLS_PER_MINUTE: 60
LOOP_SIMILARITY_THRESHOLD: 0.9
LOOP_WINDOW_SIZE: 5
TEMPO_COMPRESSION_RATIO: 0.3
COOLDOWN_DURATION_MS: 60_000
```

---

## Status

Tripwire v0.2 is an experimental kernel under active development.

- APIs may change
- Defaults are intentionally conservative
- All thresholds are configurable
- Stability is prioritized over feature growth

This project is designed to be **embedded**, not extended.

---

## Closing Note

Tripwire does not make agents smarter.
It makes them **safer**.

If your agent can act on its own,
it should also know when to stop.
