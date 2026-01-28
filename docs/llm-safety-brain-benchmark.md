# LLM Safety Brain — Local Inference Benchmark

**Tripwired v0.2.0** includes experimental support for using a local LLM as a "Safety Brain" to analyze system logs and make KILL/SUSTAIN decisions.

## Benchmark Results (January 2026)

**Hardware**: AMD RX 6700 (10GB VRAM), Ryzen 5600X, Windows 11

| Model                      | Size | Quantization | Warm Latency | Accuracy          |
| -------------------------- | ---- | ------------ | ------------ | ----------------- |
| Phi-3-mini-4k-instruct     | 3.8B | Q4_K_M       | ~2000ms      | ⚠️ Verbose output |
| Llama 3.2 3B Instruct      | 3B   | Q4_K_M       | ~575ms       | ✅ Clean JSON     |
| Qwen 2.5 1.5B Instruct     | 1.5B | Q4_K_M       | ~600ms       | ⚠️ Markdown wrap  |
| **Llama 3.2 3B + Squeeze** | 3B   | Q4_K_M       | **~130ms**   | ✅ **Winner**     |

### Winner Configuration

```typescript
// tripwire-brain.ts
const config = {
  model: 'llama-3.2-3b-instruct',
  temperature: 0.0, // Zero creativity
  maxTokens: 30, // Token starvation
  timeoutMs: 500, // Fail-safe
}
```

### Token Starvation Technique

The key optimization was reducing `maxTokens` from 150 to 30, forcing the model to output only:

```json
{ "action": "KILL" }
```

Instead of verbose explanations. Combined with a minimal prompt, this achieved **75% latency reduction**.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Trading Bot   │────▶│  Tripwired       │────▶│  LM Studio      │
│   (stdout)      │     │  Watchdog        │     │  (Llama 3.2)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │                        │
        │                       ▼                        │
        │               ┌──────────────────┐             │
        │◀──────────────│  SIGKILL         │◀────────────┘
        │               │  (if KILL)       │
        │               └──────────────────┘
```

### Key Features

- **Regex Pre-Filter**: Normal logs skip LLM entirely (0ms)
- **Parallel Watchdog**: Non-blocking process monitoring
- **Truncated JSON Repair**: Handles incomplete responses
- **Timeout Fail-Safe**: SUSTAIN on connection error

## Running the Demo

```bash
cd tripwire-demo

# Install dependencies
pnpm install

# Test scenarios
pnpm demo:normal    # Expect: SUSTAIN (0ms, pre-filtered)
pnpm demo:anomaly   # Expect: KILL (~130ms)

# Full watchdog test
pnpm watchdog:anomaly  # Bot will be killed
```

## Requirements

- [LM Studio](https://lmstudio.ai/) with Llama 3.2 3B loaded
- Node.js 18+
- API endpoint: `http://localhost:1234/v1`

## Conclusion

Local LLM inference is viable for real-time safety decisions when:

1. **Model is small** (1.5B-3B parameters)
2. **Output is minimal** (token starvation)
3. **Prompt is concise** (< 100 tokens)
4. **Pre-filtering** reduces LLM calls by 50-70%

For HFT applications requiring < 50ms, consider:

- Smaller models (Qwen 0.5B)
- TensorRT/ONNX optimization
- GPU memory pinning
- Speculative decoding
