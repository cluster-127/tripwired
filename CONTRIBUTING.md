# Contributing to Tripwire

Thank you for your interest in contributing to Tripwire! This document provides guidelines for contributing to the project.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## How to Contribute

### Reporting Bugs

If you find a bug, please open an issue with:

1. A clear, descriptive title
2. Steps to reproduce the issue
3. Expected behavior vs actual behavior
4. Your environment (Node.js version, OS, etc.)

### Suggesting Features

Feature requests are welcome! Please open an issue with:

1. A clear description of the feature
2. The problem it solves
3. Possible implementation approaches

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`pnpm test`)
5. Commit your changes (`git commit -m 'feat: add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `test:` - Adding or updating tests
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks

### Development Setup

```bash
# Clone the repo
git clone https://github.com/cluster-127/tripwire.git
cd tripwire

# Install dependencies
pnpm install

# Run tests
pnpm test

# Build
pnpm build
```

### Code Style

- TypeScript strict mode
- No any types without justification
- All public APIs must have JSDoc comments
- Tests for all new features

## Architecture Decisions

Before making significant changes, please:

1. Read the [Specification](docs/specification.md)
2. Open an issue to discuss the approach
3. Follow the existing patterns in the codebase

## Questions?

Feel free to open an issue for any questions about contributing.
