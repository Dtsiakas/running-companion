# Changelog

What changed in each release. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/): until 1.0, a minor version (0.x.0) may change how the app is
set up or configured, and its notes say what to do.

## [Unreleased]

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
