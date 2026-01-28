//! LLM Client for Log Analysis
//!
//! Optimized for localhost: No TLS, aggressive connection pooling,
//! TCP nodelay, no proxy lookup.

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

pub struct LlmClient {
    client: Client,
    endpoint: String,
    model: String,
    max_tokens: u32,
}

#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<Message>,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Debug, Serialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    message: ResponseMessage,
}

#[derive(Debug, Deserialize)]
struct ResponseMessage {
    content: String,
}

#[derive(Debug, Clone)]
pub struct Decision {
    pub action: String,
    pub confidence: u32,
    pub raw_response: String,
}

impl LlmClient {
    pub fn new(base_url: &str, model: &str, max_tokens: u32) -> Self {
        // Optimized for localhost - no TLS overhead
        let client = Client::builder()
            .no_proxy() // Skip proxy lookup (speed!)
            .pool_idle_timeout(None) // Keep connections forever
            .pool_max_idle_per_host(10) // Connection pool
            .tcp_nodelay(true) // Disable Nagle (latency killer)
            .timeout(Duration::from_millis(1500)) // Max 1.5s timeout
            .build()
            .expect("Failed to build HTTP client");

        Self {
            client,
            endpoint: format!("{}/chat/completions", base_url),
            model: model.to_string(),
            max_tokens,
        }
    }

    /// Get the prompt template (for audit fingerprinting)
    pub fn prompt_template() -> &'static str {
        r#"Log: "{log}"

KILL if: orders in 1ms, sequential #, huge exposure, timing anomaly
SUSTAIN if: normal

Respond ONLY: {"action":"KILL"} or {"action":"SUSTAIN"}"#
    }

    pub async fn analyze(
        &self,
        log: &str,
    ) -> Result<Decision, Box<dyn std::error::Error + Send + Sync>> {
        let prompt = Self::prompt_template().replace("{log}", log);

        let request = ChatRequest {
            model: self.model.clone(),
            messages: vec![Message {
                role: "user".to_string(),
                content: prompt,
            }],
            temperature: 0.0, // Deterministic
            max_tokens: self.max_tokens,
        };

        let response = self
            .client
            .post(&self.endpoint)
            .json(&request)
            .send()
            .await?
            .json::<ChatResponse>()
            .await?;

        let content = response
            .choices
            .first()
            .map(|c| c.message.content.clone())
            .unwrap_or_default();

        let decision = self.parse_decision(&content);
        Ok(decision)
    }

    fn parse_decision(&self, content: &str) -> Decision {
        // Strip markdown code blocks (Phi-3/Qwen quirk)
        let clean = content
            .replace("```json", "")
            .replace("```", "")
            .trim()
            .to_string();

        let upper = clean.to_uppercase();

        // Explicit KILL detection
        if clean.contains("\"action\"") && upper.contains("KILL") {
            return Decision {
                action: "KILL".to_string(),
                confidence: 90,
                raw_response: content.to_string(),
            };
        }

        // Explicit SUSTAIN detection
        if clean.contains("\"action\"") && upper.contains("SUSTAIN") {
            return Decision {
                action: "SUSTAIN".to_string(),
                confidence: 90,
                raw_response: content.to_string(),
            };
        }

        // CRITICAL: Uncertainty = FAIL (not SUSTAIN!)
        // A kill-switch must not assume safety when confused
        Decision {
            action: "FAIL".to_string(),
            confidence: 0,
            raw_response: content.to_string(),
        }
    }
}
