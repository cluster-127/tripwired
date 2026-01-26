# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it by emailing **me@erdem.work**.

Please do **not** open a public GitHub issue for security vulnerabilities.

We will respond within 48 hours and work with you to understand and address the issue.

## Security Best Practices

When using Tripwire:

1. **Keep dependencies updated** - Run `pnpm audit` regularly
2. **Review configuration** - Ensure thresholds are appropriate for your use case
3. **Monitor health state** - Act on SUSPENDED/STOPPED states promptly
