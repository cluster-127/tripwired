# TRIPWIRED

[![npm version](https://img.shields.io/npm/v/tripwired.svg)](https://www.npmjs.com/package/tripwired)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI](https://github.com/cluster-127/tripwired/actions/workflows/ci.yml/badge.svg)](https://github.com/cluster-127/tripwired/actions/workflows/ci.yml)

**Kill-switch kernel for autonomous AI agents.**

Tripwired monitors AI agent behavior and decides **when they should stop acting** — before they spiral out of control.

---

## Why Tripwired?

Autonomous agents rarely fail because of a single bad decision.
They fail because they **continue acting after they should have stopped**.

Tripwired catches that moment.

---

## Quick Start

```bash
npm install tripwired
```

```typescript
import { Pipeline } from 'tripwired'

const pipeline = new Pipeline()

// Feed agent events
const decision = await pipeline.process({
  timestamp: Date.now(),
  eventType: 'tool_result',
  content: 'Executed database query',
  tokenCount: 150,
  latencyMs: 200,
  outputLength: 50,
})

if (decision.action === 'STOP') {
  console.log('🛑 Agent stopped:', decision.reason)
  // Your agent shutdown logic here
  process.exit(1)
}
```

---

## How It Works

```
AgentEvent → ActivityState → IntentDecision → SafetyDecision → Intervention
             (LOOPING?)      (PAUSE/STOP?)     (Veto?)         Signal
```

**Signals monitored:**

- Token acceleration
- Tempo compression (decisions too fast)
- Loop detection (repetitive outputs)
- Dangerous command patterns

---

## Rust Kernel (High-Performance Mode)

For real-time log analysis with LLM-based decisions:

```bash
# Start kernel (Named Pipe on Windows, Unix Socket on Linux)
cargo run --release -- --llm-url http://localhost:1234/v1
```

```
Log → Regex Pre-Filter (3μs) → LLM Analysis → KILL/SUSTAIN
         ↓                         ↓
     Safe logs               Anomaly detected
     (instant bypass)        (~164ms decision)
```

**Benchmark** (Llama 3.2 3B):

| Scenario            | Latency     |
| ------------------- | ----------- |
| Pre-filtered (safe) | **0.003ms** |
| Warm (anomaly)      | **164ms**   |

---

## Filter Configuration

Customize detection patterns with TOML:

```bash
tripwired --filter-config tripwired.toml
```

```toml
domain = "trading"  # trading | devops | generic

patterns = [
    "(?i)patient.*delete",
]

exclude = [
    "(?i)test.*order",
]
```

See [tripwired.example.toml](tripwired.example.toml) for full reference.

---

## Key Configuration

```typescript
// SAFETY_GATE_CONFIG
MAX_TOKENS_PER_MINUTE: 50_000
MAX_TOOL_CALLS_PER_MINUTE: 60
LOOP_SIMILARITY_THRESHOLD: 0.9
COOLDOWN_DURATION_MS: 60_000
```

---

## Project Structure

```
src/
├── activity-engine/   # IDLE / WORKING / LOOPING / RUNAWAY
├── intent-core/       # CONTINUE / PAUSE / STOP
├── safety-gate/       # Token budget, rate limit, veto
└── runtime/           # Pipeline orchestration

kernel/                # Rust sidecar (high-performance)
```

---

## Use Cases

- **LLM Agent frameworks** (LangChain, CrewAI, Autogen)
- **Autonomous coding agents**
- **Customer service bots**
- **Any AI system with API costs at risk**

---

## License & Model

**Open-Core** — Engine is Apache 2.0, always open source.

| Component       | License     | Status    |
| --------------- | ----------- | --------- |
| Engine + Kernel | Apache 2.0  | ✅ Open   |
| Cloud Dashboard | Proprietary | 🔮 Future |

---

## Status

**v0.1.7** — Under active development. APIs may change.

---

## Links

- [Changelog](CHANGELOG.md)
- [Example Config](tripwired.example.toml)
- [npm](https://www.npmjs.com/package/tripwired)

---

_Tripwired does not make agents smarter. It makes them **safer**._
