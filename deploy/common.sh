# Shared by setup.sh and update.sh. Sourced, not run.
# shellcheck disable=SC2034  # the variables are used by the scripts that source this file

APP_DIR=/opt/running-companion
APP_USER=companion
APP_HOME=/var/lib/running-companion
SERVICE=running-companion

log() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*" >&2; }
fail() {
  printf '\n  ✗ %s\n' "$*" >&2
  exit 1
}

# Runs a command as the app user, in the app folder. The app never runs as root.
as_app() { sudo -u "$APP_USER" -H -- bash -c "cd '$APP_DIR' && $1"; }

# Installs the Node version named in .nvmrc from nodejs.org (checksum verified), if it isn't the active one already.
# Pinning to .nvmrc keeps the server on exactly the version the laptop and the tests use.
install_node() {
  local version arch tarball url dir
  version=$(tr -d 'v \n' <"$APP_DIR/.nvmrc") || return 1
  if [ "$(/usr/local/bin/node --version 2>/dev/null)" = "v$version" ]; then
    return 0
  fi
  case "$(uname -m)" in
    x86_64) arch=x64 ;;
    aarch64) arch=arm64 ;;
    *) warn "Unsupported processor: $(uname -m)" && return 1 ;;
  esac
  tarball="node-v$version-linux-$arch.tar.xz"
  url="https://nodejs.org/dist/v$version"
  dir=$(mktemp -d) || return 1
  # Every step checked explicitly: this also runs inside `if`, where bash's `set -e` doesn't apply.
  # shellcheck disable=SC2015  # `|| { … }` is meant to run when any step of the chain fails
  curl -fsSL "$url/$tarball" -o "$dir/$tarball" &&
    curl -fsSL "$url/SHASUMS256.txt" -o "$dir/SHASUMS256.txt" &&
    (cd "$dir" && grep " $tarball\$" SHASUMS256.txt | sha256sum -c --quiet -) &&
    mkdir -p /opt/node &&
    rm -rf "/opt/node/v$version" &&
    tar -xJf "$dir/$tarball" -C /opt/node &&
    mv "/opt/node/node-v$version-linux-$arch" "/opt/node/v$version" &&
    ln -sf "/opt/node/v$version/bin/node" /usr/local/bin/node &&
    ln -sf "/opt/node/v$version/bin/npm" /usr/local/bin/npm &&
    ln -sf "/opt/node/v$version/bin/npx" /usr/local/bin/npx || {
    rm -rf "$dir"
    warn "Installing Node $version failed"
    return 1
  }
  rm -rf "$dir"
  ok "Node $version installed"
}

# Copies the systemd unit files from the repo when they changed, so a commit can change how the app runs.
install_units() {
  local changed=0 unit
  for unit in "$APP_DIR"/deploy/systemd/*; do
    if ! cmp -s "$unit" "/etc/systemd/system/$(basename "$unit")"; then
      install -m 644 "$unit" /etc/systemd/system/ || return 1
      changed=1
    fi
  done
  if [ "$changed" = 1 ]; then
    systemctl daemon-reload || return 1
    ok "Service definitions updated"
  fi
}

# The commit that is built and running. Written only after a deploy succeeded, so an interrupted deploy is retried.
DEPLOYED_FILE=$APP_HOME/deployed-commit
# The last commit that failed to deploy, so it isn't retried until a newer one arrives.
FAILED_FILE=$APP_HOME/failed-commit

# Install, check and build. Tests run here too: a commit that fails them never replaces the running version.
build_app() {
  as_app 'npm ci --no-audit --no-fund --loglevel=error' &&
    as_app 'npm run --silent typecheck' &&
    as_app 'npm test --silent >/dev/null' &&
    as_app 'npm run --silent build >/dev/null'
}

# Waits up to 30 seconds for the server to answer on its local port.
wait_healthy() {
  for _ in $(seq 30); do
    curl -fs -o /dev/null http://127.0.0.1:8787/healthz && return 0
    sleep 1
  done
  return 1
}
