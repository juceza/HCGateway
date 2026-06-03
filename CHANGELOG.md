# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.1.0] - 2026-06-03

### Features

- **web**: add an optional read-only Web UI dashboard (React SPA) served by the same Flask process, bundled inside the single API Docker image and gated on `WEB_DIST`.
- **api**: add an `ALLOW_REGISTRATION` flag to gate account creation; when disabled, only existing accounts can log in.

### Bug Fixes

- **docker**: point `docker-compose.yml` at this repository's image.

### Chores

- **root**: add lint, format, and git-hook tooling across the monorepo (lefthook, commitlint, detekt).

[3.1.0]: https://github.com/juceza/HCGateway/compare/v3.0.0...v3.1.0
