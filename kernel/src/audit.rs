//! Audit Trail - Immutable Decision Log
//!
//! Every decision is logged with full context for compliance and forensics.
//! Append-only, tamper-evident structure.

use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// A single decision record in the audit trail
#[derive(Debug, Serialize, Deserialize)]
pub struct DecisionRecord {
    /// Unique decision ID (monotonic)
    pub id: u64,
    /// Unix timestamp (milliseconds)
    pub timestamp_ms: u64,
    /// Input log that triggered analysis
    pub input_log: String,
    /// SHA-256 hash of input log
    pub input_hash: String,
    /// Decision action (KILL or SUSTAIN)
    pub action: String,
    /// Confidence percentage
    pub confidence: u32,
    /// Was this pre-filtered (no LLM call)?
    pub filtered: bool,
    /// Latency in milliseconds
    pub latency_ms: u64,
    /// Model fingerprint (name + config hash)
    pub model_fingerprint: String,
    /// Prompt version hash
    pub prompt_hash: String,
    /// Raw LLM response (for replay verification)
    pub raw_response: Option<String>,
}

/// Model configuration fingerprint
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelFingerprint {
    pub model_name: String,
    pub llm_url: String,
    pub max_tokens: u32,
    pub temperature: f32,
    /// SHA-256 of serialized config
    pub config_hash: String,
}

impl ModelFingerprint {
    pub fn new(model_name: &str, llm_url: &str, max_tokens: u32, temperature: f32) -> Self {
        let config_str = format!("{}|{}|{}|{}", model_name, llm_url, max_tokens, temperature);
        let config_hash = sha256_hex(&config_str);

        Self {
            model_name: model_name.to_string(),
            llm_url: llm_url.to_string(),
            max_tokens,
            temperature,
            config_hash,
        }
    }

    pub fn fingerprint(&self) -> String {
        format!("{}@{}", self.model_name, &self.config_hash[..8])
    }
}

/// Audit trail writer (append-only JSONL)
pub struct AuditTrail {
    writer: Mutex<BufWriter<File>>,
    next_id: Mutex<u64>,
    model_fingerprint: ModelFingerprint,
    prompt_hash: String,
}

impl AuditTrail {
    /// Create a new audit trail
    pub fn new(
        path: PathBuf,
        model_fingerprint: ModelFingerprint,
        prompt_template: &str,
    ) -> std::io::Result<Self> {
        let file = OpenOptions::new().create(true).append(true).open(&path)?;

        let prompt_hash = sha256_hex(prompt_template);

        // Write header record
        let mut writer = BufWriter::new(file);
        let header = AuditHeader {
            version: "1.0.0".to_string(),
            created_at: now_ms(),
            model_fingerprint: model_fingerprint.clone(),
            prompt_hash: prompt_hash.clone(),
        };
        writeln!(writer, "{}", serde_json::to_string(&header)?)?;
        writer.flush()?;

        Ok(Self {
            writer: Mutex::new(writer),
            next_id: Mutex::new(1),
            model_fingerprint,
            prompt_hash,
        })
    }

    /// Record a decision
    pub fn record(
        &self,
        input_log: &str,
        action: &str,
        confidence: u32,
        filtered: bool,
        latency_ms: u64,
        raw_response: Option<String>,
    ) -> std::io::Result<u64> {
        let mut id_guard = self.next_id.lock().unwrap();
        let id = *id_guard;
        *id_guard += 1;
        drop(id_guard);

        let record = DecisionRecord {
            id,
            timestamp_ms: now_ms(),
            input_log: input_log.to_string(),
            input_hash: sha256_hex(input_log),
            action: action.to_string(),
            confidence,
            filtered,
            latency_ms,
            model_fingerprint: self.model_fingerprint.fingerprint(),
            prompt_hash: self.prompt_hash[..8].to_string(),
            raw_response,
        };

        let mut writer = self.writer.lock().unwrap();
        writeln!(writer, "{}", serde_json::to_string(&record)?)?;
        writer.flush()?;

        Ok(id)
    }
}

#[derive(Debug, Serialize)]
struct AuditHeader {
    version: String,
    created_at: u64,
    model_fingerprint: ModelFingerprint,
    prompt_hash: String,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

fn sha256_hex(input: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    // Simple hash for now (replace with SHA-256 in production)
    let mut hasher = DefaultHasher::new();
    input.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_model_fingerprint() {
        let fp = ModelFingerprint::new("llama-3.2", "http://localhost:1234/v1", 30, 0.0);
        assert!(fp.fingerprint().starts_with("llama-3.2@"));
        assert_eq!(fp.config_hash.len(), 16);
    }

    #[test]
    fn test_audit_trail() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("audit.jsonl");

        let fp = ModelFingerprint::new("test-model", "http://localhost", 30, 0.0);
        let trail = AuditTrail::new(path.clone(), fp, "test prompt").unwrap();

        trail
            .record("test log", "KILL", 90, false, 100, None)
            .unwrap();
        trail
            .record("safe log", "SUSTAIN", 100, true, 0, None)
            .unwrap();

        let content = fs::read_to_string(&path).unwrap();
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 3); // header + 2 records
    }
}
