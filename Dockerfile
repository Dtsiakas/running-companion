# Running Companion as a container: the web app, the Claude connector (/mcp) and the scheduled Garmin sync in one
# process. Everything that must survive an update lives in /data (database, settings, Garmin token): mount a volume.
#
#   docker build -t running-companion .
#   docker run -d -p 127.0.0.1:8787:8787 -v companion-data:/data running-companion
#   docker logs <container>     ← the first start prints the setup link
#
# Node runs the TypeScript sources directly (type stripping), so only the dashboard is built.

ARG NODE_VERSION=26.13.0

# 1. Install everything and build the dashboard ------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
# Manifests first: the dependency layer is reused until one of them changes.
COPY package.json package-lock.json ./
COPY packages/cli/package.json packages/cli/
COPY packages/config/package.json packages/config/
COPY packages/dates/package.json packages/dates/
COPY packages/db/package.json packages/db/
COPY packages/demo/package.json packages/demo/
COPY packages/garmin-client/package.json packages/garmin-client/
COPY packages/i18n/package.json packages/i18n/
COPY packages/insights/package.json packages/insights/
COPY packages/jobs/package.json packages/jobs/
COPY packages/mcp/package.json packages/mcp/
COPY packages/metrics/package.json packages/metrics/
COPY packages/queries/package.json packages/queries/
COPY packages/server/package.json packages/server/
COPY packages/sync/package.json packages/sync/
COPY packages/weather/package.json packages/weather/
COPY packages/web/package.json packages/web/
RUN npm ci --no-audit --no-fund
COPY . .
ARG VITE_SOURCE_URL
RUN npm run build \
 # The running app needs no build tools, tests or the dashboard's sources: drop them from what gets copied on.
 && npm prune --omit=dev --no-audit --no-fund \
 && rm -rf packages/*/test packages/web/src packages/web/public

# 2. The image that runs ---------------------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim
ARG VERSION=dev
LABEL org.opencontainers.image.title="Running Companion" \
      org.opencontainers.image.description="Your Garmin running and health data, explained, with a connector for Claude." \
      org.opencontainers.image.source="https://github.com/Dtsiakas/running-companion" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.version="${VERSION}"
ENV NODE_ENV=production \
    COMPANION_DATA_DIR=/data \
    COMPANION_DEMO_DIR=/data/demo \
    HOST=0.0.0.0 \
    PORT=8787
WORKDIR /app
COPY --from=build --chown=node:node /app /app
# npm and corepack come with the Node image but nothing here runs them: removing them takes their dependencies (and
# those dependencies' security advisories) out of the image.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
 && mkdir -p /data && chown node:node /data
# Not root: the app only ever writes to /data.
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 8787) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "--disable-warning=ExperimentalWarning", "packages/server/src/main.ts"]
