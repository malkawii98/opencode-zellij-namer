# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-09-21

### Added

- OpenCode V2 terminal plugin with Gemini task naming and stable Zellij tab targeting.
- Multi-pane names, local pane ownership, cancellation, retry backoff, and reason-bearing logs.
- Bounded user-history recovery for resumed sessions with truncated UI caches.
- Local installer using automatically discovered server/TUI entrypoints.
- Integration tests for navigation races, cooldown, cancellation, fallback recovery, and resumed sessions.

### Changed

- Fork package namespace is `@malkawii98/opencode-zellij-namer`.
- V1 implementation remains available via `./v1`; V2 naming runs only in the terminal client.
- Gemini default is `gemini-3.5-flash-lite`, with a 15-second abort deadline.

## [1.0.0] - 2025-12-18

### Added
- Initial release
- AI-powered session naming using Gemini 3 Flash
- Heuristic fallback when AI unavailable
- Configurable cooldown and debounce
- Debug logging via environment variable
- Support for intent detection: feat, fix, debug, refactor, test, doc, ops, review, spike
- Contextual tag extraction from file paths and activity

### Security
- Safe command execution using execFileSync (no shell injection)
- Path traversal protection for package.json reading
- Input validation on all event payloads
- Bounded signal buffer to prevent memory growth
