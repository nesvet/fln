# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-02-03

### Added

- CLI tool to flatten codebases into single LLM-ready files
- Markdown and JSON output formats
- JavaScript/TypeScript API for programmatic usage
- Configuration file support (`.flatr.json`)
- Gitignore-aware scanning with customizable excludes and includes
- Fast parallel file processing
- Binary file detection and filtering
- Configurable size limits (per-file and total)
- Smart file ordering for optimal LLM comprehension
- Auto-detection and skipping of flatr-generated files
- Dry-run mode for previewing output
- Project metadata detection (`package.json`/`Cargo.toml`/`pyproject.toml`/`vcpkg.json`/`go.mod`/`CMakeLists.txt`)
- Deterministic output naming with version detection
- Token counting for LLM context estimation
- Progress tracking with callback API
- Custom banner and footer support
- Quiet and verbose logging modes
- Cross-platform shell installers with SHA256 verification (macOS, Linux, Windows)
- Comprehensive test suite

[Unreleased]: https://github.com/nesvet/flatr/compare/1.0.0...HEAD
[1.0.0]: https://github.com/nesvet/flatr/releases/tag/1.0.0
