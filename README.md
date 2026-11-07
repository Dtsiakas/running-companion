# Running Companion

My personal running and health dashboard, built on Garmin's read-only Personal API. It runs on my Windows laptop:
the Garmin key and the database stay there. Claude can read the data through the app's MCP connector. Races,
predictions and training plans stay in Garmin Connect.

This is a personal project. It isn't set up or supported for anyone else.

## Install and run

1. Download `Running-Companion-Setup-<version>.exe` from the [latest release](https://github.com/Dtsiakas/running-companion/releases/latest)
   and run it. It brings its own Node and needs no administrator rights. Windows warns about an unsigned installer the
   first time: More info → Run anyway.
2. Start **Running Companion** from the Start Menu. A window opens along with the browser. Closing the window turns
   the app off.
3. The first start shows the setup page: choose a password and paste a
   [Garmin Personal API key](https://connect.garmin.com/app/settings/personalApiToken).

- **Data:** `%LOCALAPPDATA%\Running Companion\data`. Installing a new version or uninstalling never touches it.
- **Forgot the password:** Start Menu → "Running Companion (new password)".
- **Phone and Claude on the web:** with Tailscale connected, the window asks once whether to open a public HTTPS
  address through Tailscale Funnel (only while the window is open). The answer is kept in `desktop.json` next to the
  data folder; delete that file to be asked again.
- **Claude connector:** Settings → Claude shows the address (`https://<machine>.ts.net/mcp`). Add it in Claude as a
  custom connector and approve it with the password.
- **Food log:** ask Claude to log a meal ("log this", with a photo or a description). It only logs when asked. Meals
  show on Today (removable there) and the last two weeks with feedback on Body.
- **Backups:** one a day in `data\backups`, automatic. To restore: close the app, then from a clone run
  `npm run restore -- <file>` with `COMPANION_DATA_DIR` pointing at the data folder.

## Development

Node 26 (it runs the TypeScript directly).

| Command | What it does |
|---|---|
| `npm run demo` | The app on generated data at http://localhost:8788: no key, no login |
| `npm start` | The server on http://localhost:8787 with data in `data/` |
| `npm run dev:web` | The dashboard with instant reload, proxying `/api` to `npm start` |
| `npm run build` | Builds the dashboard |
| `npm run sync`, `npm run metrics` | Sync from Garmin; recompute metrics (`--full` for everything) |
| `npm run backup`, `npm run restore -- <file>` | Back up or restore the data folder |
| `npm run set-password` | New login password |
| `npm test`, `npm run typecheck` | Tests (synthetic data only) and types |

**Releasing:** put the notes under a new version in `CHANGELOG.md`, set that version in every `package.json`, push,
then publish a release with tag `v<version>` on GitHub. CI builds the installer, installs, starts and uninstalls it
on Windows, and attaches it to the release.

## Notes

- **Metrics:** formulas and their assumptions are in `packages/metrics/src` and in the MCP tool `describe_data`.
  Thresholds (LTHR, max and resting HR) come from the latest Garmin profile.
- **Weather:** [Open-Meteo](https://open-meteo.com), no key. It receives coordinates rounded to about 100 m and dates.
- **Maps:** OpenStreetMap tiles.
- **Privacy:** when Claude reads the data, the tool results it uses are sent to Anthropic as part of that chat.

## License

Copyright (C) 2026 Dimitris Tsiakas. AGPL-3.0-or-later, see [LICENSE](LICENSE).

Not affiliated with Garmin. Not medical advice.
