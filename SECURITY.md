# Security

Running Companion holds health data: sleep, heart rate, HRV, weight and the routes you run. Security reports are
taken seriously.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: on the repository page, open **Security** → **Report a
vulnerability**. Don't open a public issue for a security problem.

Include what you found, how to reproduce it, and what an attacker could do with it. You'll get an answer within a week.

## What's in scope

- Getting into someone's instance without their password, or past the sign-in that protects the AI connector (`/mcp`).
- Reading or changing data through the dashboard API or the connector tools in ways they shouldn't allow.
- The Garmin API key or session secrets leaking (to logs, the browser, or the network).

## How the app is meant to be run

Each person runs their own copy for their own data. The server listens on `127.0.0.1` and should be reached only
through HTTPS (Tailscale Funnel or a reverse proxy). The login password and `SESSION_SECRET` protect everything; keep
`.env` private, and use a long password.
