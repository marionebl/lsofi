# Changelog

## Unreleased

### Breaking changes

- Minimum supported Node.js version raised to `>=20.0.0`.
- Package metadata migrated to dual-module exports (`import` + `require`) with `type: module`.

### Changed

- Modernized lint/test toolchain and CI to GitHub Actions (Linux + Windows, Node 20/22).
- Replaced numeric validation dependency (`is-number`) with native checks.
- Replaced transform-stream dependency (`through2`) with native `readline`-based parsing.
- Added parsing regression tests and numeric edge-case tests.
