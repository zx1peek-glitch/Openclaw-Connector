# Contributing to OpenClaw Connector

[简体中文](CONTRIBUTING.zh-CN.md) | English

Thank you for your interest in contributing! Here's how you can help.

## Reporting Bugs

Open an [issue](https://github.com/liuzeming-yuxi/Openclaw-Connector/issues) with:

- Steps to reproduce
- Expected vs actual behavior
- macOS version and app version

## Suggesting Features

Open an issue with the `enhancement` label describing:

- The problem you're trying to solve
- Your proposed solution

## Development Setup

```bash
# Prerequisites: Node.js 18+, pnpm, Rust toolchain

git clone https://github.com/liuzeming-yuxi/Openclaw-Connector.git
cd Openclaw-Connector
pnpm install
pnpm tauri dev
```

## Pull Requests

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run tests before submitting:
   ```bash
   pnpm test
   cargo test --manifest-path src-tauri/Cargo.toml
   ```
4. Write a clear PR description explaining what and why

## Code Style

- **TypeScript**: Follow existing patterns, use strict types
- **Rust**: Run `cargo fmt` and `cargo clippy` before committing
- **Commits**: Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, etc.)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
