# Security

Running Companion holds health data and a Garmin key, and it's meant to be reachable from the internet. Security
problems matter, and reports are welcome.

## Reporting a problem

Please don't open a public issue. Report it privately through
[GitHub's security advisories](https://github.com/Dtsiakas/running-companion/security/advisories/new), with what you
found, how to reproduce it, and what someone could do with it. You'll get an answer within a week. Once it's fixed
and released, the advisory is published, with credit to you unless you'd rather not.

## Supported versions

Only the latest release gets fixes. Updating is `docker compose pull && docker compose up -d`, or `git pull` and a
restart (`npm run up` does both).

## What's in scope

The server and dashboard in this repository: login and sessions, the setup page, the OAuth flow and `/mcp` endpoint
for Claude, the API, backups, and the Docker image and Compose files.

Not in scope: Garmin's API and Claude themselves, and setups that remove the protections the README describes (an
exposed `HOST=0.0.0.0` without a proxy, a shared `.env`, demo mode on real data).

## How the app protects your data

- Nothing is reachable before setup except the setup page, and setup needs a one-time code printed in the server's log.
- Passwords are stored as scrypt hashes. Login and setup are rate-limited.
- The Garmin key is never sent to the browser. Settings and backups are written readable by their owner only.
- Claude connects through OAuth with its own tokens. Its database access is read-only; the one thing it can start is a
  Garmin sync.
- The Docker image runs as an unprivileged user and writes only to its data volume.
