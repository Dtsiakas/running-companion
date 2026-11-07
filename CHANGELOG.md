# Changelog

What changed in each release. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
versions follow [Semantic Versioning](https://semver.org/): until 1.0, a minor version (0.x.0) may change how the app is
set up or configured, and its notes say what to do.

## [Unreleased]

## [0.4.0] - 2026-11-07

A personal app from here on: Windows only, for one person. Everything that existed only for other people is gone.

### Removed

- Docker image, Compose files, server deployment scripts and the `npm run up`/`npm run down` laptop setup.
  The Windows installer is the way to run it.
- The listings: MCP Registry entry (marked deleted), Glama (deprecated), the awesome-list submission, the Claude
  skill and `server.json`.
- Claude Desktop's local (stdio) connector and its installer and doctor. Claude connects over the app's address.
- Miles, °F and pounds: metric only.
- The "new version" notice in Settings.
- macOS and Linux support in the desktop launcher.
- `npm run discover` and `npm run auth:check`, contributor guides, issue templates, Dependabot, CodeQL, the image scan
  and the accessibility audit.

### Changed

- Settings → Backups says where the backups are, instead of pointing at commands.
- CI runs the tests on Linux and the installer test on Windows.

## [0.3.3] - 2026-11-07

### Fixed

- The Windows app never asked about Tailscale on some computers, even with Tailscale connected. When Tailscale printed
  a warning (for example that its app and its service are different versions), the app couldn't read its status and
  assumed there was no Tailscale. It now reads only the status itself.
- The window now says where Tailscale stands instead of saying nothing: installed but not connected, or turned off by
  your earlier answer (and how to be asked again).

## [0.3.2] - 2026-11-07

### Added

- Password and key fields have a Show button, so you can check what you typed: on the setup, login and new-password
  pages, and for the password and Garmin key in Settings. Fields go back to hidden when the form is sent.
- Forgot the password? The Windows app's Start Menu has a "Running Companion (new password)" shortcut that sets a new
  one. It works on that computer only, whether the app is on or not, and signs out every other device. From a clone:
  `node packages/cli/src/desktop.ts --set-password`.

### Fixed

- A fresh install crashed on Today before the first sync, since there was no data yet. Today now says what to do next:
  add the Garmin key in Settings, or run the first sync. The API answers "nothing here" with 404 instead of 200 with
  an error, and the app no longer offers "Try again" for something that isn't there.

## [0.3.1] - 2026-11-07

### Fixed

- The Windows app stopped at once on some computers with "Cannot find package '@companion/config'". It linked its
  internal packages into `node_modules` on first start, and those links weren't always there when the server started.
  It now finds them with a resolve hook and makes no links at all, and CI starts it through the Start Menu shortcut,
  as a user does. To update, run the new installer: your data isn't touched.

## [0.3.0] - 2026-11-07

### Added

- A Windows installer (`Running-Companion-Setup-<version>.exe`, about 28 MB) on every release. It brings its own Node
  and needs no administrator rights. The Start Menu shortcut opens one window and the browser; the first start goes
  straight to setup with the code filled in, and closing the window turns everything off. Data goes in
  `%LOCALAPPDATA%\Running Companion`, so updating or uninstalling never touches it. With Tailscale connected, it asks
  once whether to use Funnel for the phone and Claude on the web. Built and tested (installed, started, uninstalled)
  in CI. Not code-signed yet.
- `node packages/cli/src/desktop.ts` runs the same launcher from a clone, on any OS.
- An opt-in notice in Settings → About when a new version is out, with how to update for the installer, Docker or a
  clone. When on, the app asks GitHub for the newest version number once a day and sends nothing about you.

## [0.2.1] - 2026-11-06

### Added

- Listed in the [MCP Registry](https://registry.modelcontextprotocol.io) as `io.github.Dtsiakas/running-companion`: the
  Docker image can run the connector over stdio against an existing install's volume. Each release updates the listing.
- A skill (`skills/running-companion/SKILL.md`) for Claude Code and other agents: which tool answers which question,
  and how to answer from the data.

### Fixed

- `npm run up` failed to start after the code was updated with a `git pull` by hand ("Cannot find package
  '@companion/dates'"): it only installed dependencies when it pulled the update itself. It now installs and builds
  whenever the lockfile or the commit differs from what was installed and built last, and builds quietly.
- The connector's data guide described the author's own data (sleep gap, training breaks, database size) as facts about
  every user; its caveats are now general.
- `deploy/setup.sh` asked for a deploy key on the repo, which only the owner can add, so it stopped on anyone else's
  server. The repo is public: it now clones over HTTPS. It also asks for the time zone instead of assuming Athens.

## [0.2.0] - 2026-10-31

Nothing to change when updating from 0.1.0, except for Docker: take the Compose files from this release (the ones in
0.1.0 were rejected by `docker compose`).

### Added

- Backups: a daily automatic one (database and settings, the newest 7 kept, `BACKUP_KEEP`), `npm run backup` for a full
  one with the FIT files, and `npm run restore`, which moves what was there aside instead of deleting it. Both work from
  Docker through standard input and output.
- Settings shows whether Claude is connected (and when it last signed in), the connector address to copy, and a
  button that signs Claude out everywhere. It also shows the last backup.
- Tests run on Windows as well as Linux in CI, since the app is often run on a Windows laptop.
- Security scanning: CodeQL on every push and pull request, and a weekly Trivy scan of the published image.
- README screenshots, `SECURITY.md`, `CONTRIBUTING.md` and issue templates.

### Changed

- "What works for you" corrects for the number of comparisons (Benjamini–Hochberg). It runs about two dozen tests, so
  at p < 0.05 one fluke was expected; a result that only passed on its own now says it could still be chance. Claude
  gets the raw and adjusted p-values and the effect size.
- Claude's SQL queries run in a separate process with a 15-second limit, so a heavy or runaway query can't freeze the
  dashboard and API.
- Accessibility: every page passes an axe audit in both themes, both languages and at phone width (contrast of
  secondary text, keyboard access to wide tables, map and chart descriptions for screen readers, in Greek too). CI
  runs that audit on every push (`npm run test:a11y`).
- The login, setup and consent pages use the dashboard's colours.
- The image no longer ships npm and corepack (unused at runtime), which removes all of its high and critical scan
  findings.
- Requests to Garmin that get no answer at all (Wi-Fi dropping, a laptop waking up) are retried like a 503 instead of
  failing the sync, and signing in to Garmin has a time limit: a connection that never answered could hold up every
  later sync until a restart.
- Durations under an hour read "47 min", not "0h 47"; chart axes tick at round values; clearer labels on the run page
  ("Watch temperature") and Today ("last night's sleep").
- TypeScript 7, and newer GitHub Actions for the image builds.

### Fixed

- In the first weeks with the app, an ordinary week was flagged as a training-load spike ("act today") and the weekly
  report said things like "656% above your usual": both compared with a "4-week average" that was mostly days before
  any data. Load spikes now need 28 days of history, deep-fatigue warnings 42 (fitness and fatigue both start from
  zero), and the weekly comparison with "your usual" three of the previous four weeks on record. Milestone estimates
  ("around 22 January") use the history there is, and wait for two weeks of it.
- The Compose files in 0.1.0 were rejected by `docker compose` (the optional `.env` was written in a form it doesn't
  accept). CI now validates them.
- Login redirects refuse targets with control characters or backslashes, which browsers can turn into another site.
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

[Unreleased]: https://github.com/Dtsiakas/running-companion/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/Dtsiakas/running-companion/compare/v0.3.3...v0.4.0
[0.3.3]: https://github.com/Dtsiakas/running-companion/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/Dtsiakas/running-companion/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/Dtsiakas/running-companion/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/Dtsiakas/running-companion/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/Dtsiakas/running-companion/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Dtsiakas/running-companion/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Dtsiakas/running-companion/releases/tag/v0.1.0
