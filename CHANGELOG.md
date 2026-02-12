# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.3] - 2026-02-12

### Fixed

- npx run (Node ESM compatibility via explicit .js imports)
- Native Windows ARM64 build support (release workflow and install script)

### Changed

- Show full install path in Windows install script (instead of `~` shorthand)
- Replace bare path imports with explicit `index.js` for Node ESM
- Run tests after npm build in CI

## [1.1.2] - 2026-02-11

### Added

- Colored install script output with FLN_SILENT to disable
- Install script validation (version, directory, file size limits)
- PATH detection and shell-specific instructions in install scripts

### Fixed

- Correct gitignore check for directories in scanTree (trailing slash)
- Extend NO_COLOR support to any non-empty value per spec

### Changed

- Replace TypeScript path aliases with relative imports
- CLI entry point moved from `main.ts` to `index.ts`
- Improved error handling with optional DEBUG stack trace
- Install URLs updated to fln.nesvet.dev
- Add `pom.xml` to manifest list in docs

## [1.1.1] - 2026-02-10

### Added

- API option to overwrite existing output files

### Fixed

- Corrected markdown line break for generated date

## [1.0.0] - 2026-02-09

### Added

- CLI tool to flatten codebases into single LLM-ready files
- Markdown and JSON output formats
- JavaScript/TypeScript API for programmatic usage
- Configuration file support (`.fln.json`)
- Gitignore-aware scanning with customizable excludes and includes
- Fast parallel file processing
- Binary file detection and filtering
- Configurable size limits (per-file and total)
- Smart file ordering for optimal LLM comprehension
- Auto-detection and skipping of fln-generated files
- Dry-run mode for previewing output
- Project metadata detection (`package.json`/`Cargo.toml`/`pyproject.toml`/`vcpkg.json`/`go.mod`/`CMakeLists.txt`)
- Deterministic output naming with version detection
- Token counting for LLM context estimation
- Progress tracking with callback API
- Custom banner and footer support
- Quiet and verbose logging modes
- Cross-platform shell installers with SHA256 verification (macOS, Linux, Windows)
- Comprehensive test suite

[Unreleased]: https://github.com/nesvet/fln/compare/1.1.3...HEAD
[1.1.3]: https://github.com/nesvet/fln/compare/1.1.2...1.1.3
[1.1.2]: https://github.com/nesvet/fln/compare/1.1.1...1.1.2
[1.1.1]: https://github.com/nesvet/fln/compare/1.0.0...1.1.1
[1.0.0]: https://github.com/nesvet/fln/releases/tag/1.0.0
