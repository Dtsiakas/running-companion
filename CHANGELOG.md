# Changelog

What changed in each release. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/): until 1.0, a minor version (0.x.0) may change how the app is
set up or configured, and its notes say what to do.

## [Unreleased]

### Added

- Backups: a daily automatic one (database and settings, the newest 7 kept, `BACKUP_KEEP`), `npm run backup` for a full
  one with the FIT files, and `npm run restore`, which moves what was there aside instead of deleting it. Both work from
  Docker through standard input and output.

- Settings shows whether Claude is connected (and when it last signed in), the connector address to copy, and a
  button that signs Claude out everywhere. It also shows the last backup.
- README screenshots, `SECURITY.md`, `CONTRIBUTING.md` and issue templates.

### Changed

- Claude's SQL queries run in a separate process with a 15-second limit, so a heavy or runaway query can't freeze the
  dashboard and API.
- Accessibility: every page passes an axe audit in both themes, both languages and at phone width (contrast of
  secondary text, keyboard access to wide tables, map and chart descriptions for screen readers, in Greek too).
- The login, setup and consent pages use the dashboard's colours.
- Durations under an hour read "47 min", not "0h 47"; chart axes tick at round values; clearer labels on the run page
  ("Watch temperature") and Today ("last night's sleep").
- TypeScript 7, and newer GitHub Actions for the image builds.

### Fixed

- A badly encoded session cookie caused a server error on every request instead of a login prompt.
- The weekly report tool for Claude used the UTC date as "today", a day behind after midnight in Europe.
- OAuth clients from abandoned connection attempts were never cleaned up.
- The connector reported version 0.1.0 whatever the release.

## [0.1.0] - 2026-10-31

The first release.

### Added

- Garmin sync through the Personal API: runs with GPS, splits and running dynamics, sleep, HRV, resting heart rate,
  stress, Body Battery and body composition, into a local SQLite database.
- Dashboard (installable as an app): Today with a train-or-rest status and the reasons for it, runs with maps, splits,
  heat-adjusted pace and form, weeks, sleep, body and fuel, progress (bests, streaks, year in review), trends and
  personal patterns.
- Connector for Claude (MCP over OAuth), with tools for today, runs, trends, reports and read-only SQL.
- Setup page on first start, and Settings for the Garmin key (with expiry reminders) and the password.
- English and Greek, following the device, with a choice in Settings.
- Kilometres or miles, °C or °F, kg or lb.
- Demo mode with generated data: `npm run demo`, or the Docker image (see the README).
- Docker image for amd64 and arm64 at `ghcr.io/dtsiakas/running-companion`, with Compose files for local use,
  Tailscale Funnel and Caddy.

[Unreleased]: https://github.com/Dtsiakas/running-companion/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Dtsiakas/running-companion/releases/tag/v0.1.0
