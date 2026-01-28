//! Regex Pre-Filter for Log Analysis
//!
//! Fast path filtering to avoid LLM calls for obviously safe logs.
//! Uses RegexSet for single-pass matching across all patterns.
//! Runs in microseconds.

use regex::RegexSet;
use std::sync::LazyLock;

/// Suspicious patterns that require LLM analysis
/// Uses RegexSet for O(n) single-pass matching instead of O(n*m)
static SUSPICIOUS_PATTERNS: LazyLock<RegexSet> = LazyLock::new(|| {
    RegexSet::new([
        // Trading/Financial patterns
        r"(?i)order",
        r"(?i)buy|sell",
        r"(?i)trade|position",
        r"(?i)error|exception|failed",
        r"(?i)warning|critical|alert",
        r"(?i)exposure|leverage|margin",
        r"within \d+\s?ms",
        r"#\d{3,}", // Sequential order numbers
        // Dangerous system commands
        r"(?i)rm\s+-rf",
        r"(?i)rmdir|del\s+/[sfq]",
        r"(?i)format\s+[a-z]:",
        r"(?i)drop\s+(table|database)",
        r"(?i)truncate\s+table",
        r"(?i)delete\s+from",
        r"(?i)kill\s+-9|taskkill",
        r"(?i)shutdown|reboot|halt",
        r"(?i)sudo|runas|admin",
        r"(?i)chmod\s+777|chmod\s+\+x",
        r"(?i)curl\s+.*\|\s*(sh|bash)",
        r"(?i)eval\s*\(",
        r"(?i)exec\s*\(",
        r"(?i)spawn|fork|system\s*\(",
    ])
    .expect("Invalid regex patterns")
});

/// Check if a log line contains suspicious patterns
///
/// Returns true if the log should be analyzed by LLM,
/// false if it can be safely skipped.
pub fn is_suspicious(log: &str) -> bool {
    SUSPICIOUS_PATTERNS.is_match(log)
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
