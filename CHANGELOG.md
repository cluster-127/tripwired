# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.7] - 2026-01-28

### Added

- **FilterConfig System** - User-configurable filter patterns via TOML
  - `--filter-config <path>` CLI flag for custom config file
  - Domain presets: `trading`, `devops`, `generic`
  - `patterns`: Add custom regex patterns
  - `exclude`: Whitelist patterns to skip (false positive prevention)
- **Container/Orchestration Patterns** (Essential tier)
  - `docker --privileged` - Privileged container escape risk
  - `kubectl delete --all` - Kubernetes mass deletion
- **Disk Destruction Patterns** (Essential tier)
  - `dd if=/dev/zero` - Disk overwrite
  - `mkfs.*` - Filesystem format

### Changed

- Filter architecture now supports runtime configuration
- Essential patterns: 17 → 21 patterns (4 new)

---

## [0.1.6] - 2026-01-28

### Changed

- **Tiered Pattern System** - Architectural refactor of regex pre-filter
  - **Essential tier**: System-critical patterns (always enabled, read-only)
    - Destructive file ops: `rm -rf`, `rmdir /s`, `del /s/f/q`, `format`
    - Database destruction: `DROP TABLE`, `TRUNCATE TABLE`
    - Privilege escalation: `sudo`, `runas`, `chmod 777`
    - Process termination: `kill -9`, `taskkill /F`, `shutdown`, `reboot`
    - Code injection: `eval()`, `exec()`
    - Remote execution: `curl | sh/bash`
  - **Trading tier**: Domain-specific patterns (order, trade, exposure, etc.)

### Fixed

- **`rmdir` Pattern** - Now requires `/s` flag to trigger (was matching safe rmdir)
- **Pattern Grouping** - Separated `rmdir` and `del` into distinct patterns

### Added

- **Comprehensive Test Coverage** - 10 new filter tests (was 2, now 12 total)
  - Essential tier: 6 test functions covering all pattern categories
  - Trading tier: 2 test functions
  - Safe patterns: 2 test functions (false positive prevention)

---

## [0.1.5] - 2026-01-28

### Added

- **Dangerous Command Patterns** - Extended regex filter for general-purpose safety
  - System commands: `rm -rf`, `rmdir`, `del /s/f/q`, `format`
  - Database: `drop table`, `truncate table`, `delete from`
  - Privileges: `sudo`, `runas`, `admin`, `chmod 777`
  - Process control: `kill -9`, `taskkill`, `shutdown`, `reboot`
  - Code execution: `eval()`, `exec()`, `spawn()`, `system()`
  - Remote execution: `curl | sh`, `curl | bash`

## [0.1.4] - 2026-01-28

### Added

- **DriftMonitor Full Implementation** - Rolling window metrics for drift detection
  - Decision metrics: veto rate, confidence mean/variance
  - State metrics: flip frequency, chaotic ratio/duration
  - Execution metrics: slippage trend, fill ratio mean
  - Automatic baseline collection with validation criteria
- **Core Module Unit Tests** - 42 new tests addressing QA coverage gaps
  - `ActivityEngine`: loop detection, runaway detection, intensity levels, state transitions
  - `IntentCore`: intent generation, confidence calculation, decay logic, invalidation
  - `SafetyGate`: budget tracking, veto logic, health degradation, rate limiting

### Fixed

- **Version Consistency** - Aligned package.json and Cargo.toml at v0.2.0
- **Test Infrastructure** - Fixed AgentEvent helpers with required `latencyMs` and `outputLength` fields

## [0.1.3] - 2026-01-28

### Fixed

- **DriftMonitor Wiring** - Pipeline now feeds DriftMonitor with decision and state transition data
  - `recordDecision()` called after each safety evaluation
  - `recordStateTransition()` called on mode changes
  - `tick()` drives drift detection loop
- **Named Pipe Race Condition** - Pre-creates next server instance before processing
  - Eliminates reconnection gap (zero-downtime client reconnect)
- **RegexSet Optimization** - Single-pass O(n) matching instead of O(n\*m)
  - ~10-20% pre-filter performance improvement

## [0.1.2] - 2026-01-28

### Fixed

- **Real SHA-256** - Replaced fake SipHash with cryptographic `sha2` crate
  - Config hash now 64 chars (was 16)
  - Proper audit trail integrity
- **FAIL on Parse Uncertainty** - LLM parse errors now return FAIL instead of SUSTAIN
  - Kill-switch no longer assumes safety when confused
  - Added FAIL action handler with warning output

## [0.1.1] - 2026-01-28

### Added

- **Rust Execution Kernel** (`kernel/`) - High-performance sidecar for sub-200ms decisions
  - TCP server with Named Pipe (Windows) / Unix Socket (Linux) support
  - Regex pre-filter (3μs) for instant bypass of safe logs
  - Optimized HTTP client (tcp_nodelay, connection pooling, no_proxy)
  - SIGKILL/taskkill process termination
- **Audit Trail** - Immutable JSONL decision log
  - Input hash (SHA-256 fingerprint)
  - Model fingerprint (name@config_hash)
  - Prompt version hash
  - Raw LLM response capture
- **Node.js SDK Client** - Auto-reconnecting client with Named Pipe → TCP fallback

### Performance

| Metric       | Before | After     | Improvement    |
| ------------ | ------ | --------- | -------------- |
| Cold Start   | 543ms  | 467ms     | 14% faster     |
| Warm Latency | 540ms  | **164ms** | **70% faster** |
| Pre-filter   | N/A    | 0.003ms   | Instant        |

### Changed

- LLM client now uses aggressive connection pooling (`pool_idle_timeout: None`)
- Prompt optimized for JSON-only output (reduced token generation)

## [0.1.0] - Initial Release

### Added

- ActivityEngine (IDLE/WORKING/LOOPING/RUNAWAY states)
- IntentCore (CONTINUE/PAUSE/STOP decisions)
- SafetyGate (token budget, rate limit, loop detection)
- Health Model with exponential decay
- LLM Safety Brain (experimental, requires LM Studio)
