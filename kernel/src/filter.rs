//! Regex Pre-Filter for Log Analysis
//!
//! Fast path filtering to avoid LLM calls for obviously safe logs.
//! Runs in microseconds.

use regex::Regex;
use std::sync::LazyLock;

/// Suspicious patterns that require LLM analysis
static SUSPICIOUS_PATTERNS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    vec![
        Regex::new(r"(?i)order").unwrap(),
        Regex::new(r"(?i)buy|sell").unwrap(),
        Regex::new(r"(?i)trade|position").unwrap(),
        Regex::new(r"(?i)error|exception|failed").unwrap(),
        Regex::new(r"(?i)warning|critical|alert").unwrap(),
        Regex::new(r"(?i)exposure|leverage|margin").unwrap(),
        Regex::new(r"within \d+\s?ms").unwrap(),
        Regex::new(r"#\d{3,}").unwrap(), // Sequential order numbers
    ]
});

/// Check if a log line contains suspicious patterns
///
/// Returns true if the log should be analyzed by LLM,
/// false if it can be safely skipped.
pub fn is_suspicious(log: &str) -> bool {
    SUSPICIOUS_PATTERNS
        .iter()
        .any(|pattern| pattern.is_match(log))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_logs() {
        assert!(!is_suspicious("User logged in successfully"));
        assert!(!is_suspicious("Session initialized"));
        assert!(!is_suspicious("Balance updated to 100 USDT"));
    }

    #[test]
    fn test_suspicious_logs() {
        assert!(is_suspicious("Order #991 placed"));
        assert!(is_suspicious("ERROR: Connection failed"));
        assert!(is_suspicious("Executed within 1ms"));
        assert!(is_suspicious("Total exposure: 500,000 USDT"));
    }
}
