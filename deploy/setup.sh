#!/usr/bin/env bash
# One-time server setup for Running Companion on a fresh Ubuntu 24.04 server. From the project folder on your laptop:
#
#   scp deploy/setup.sh ubuntu@<server IP>:
#   ssh -t ubuntu@<server IP> "sudo bash setup.sh"
#
# Safe to run again: every step checks what is already done. It asks for the Garmin key and the dashboard password
# on the server, hidden as you type; neither is ever shown, logged or sent anywhere but the server's .env file.

set -euo pipefail

REPO=git@github.com:Dtsiakas/running-companion.git
REPO_PAGE=https://github.com/Dtsiakas/running-companion
# GitHub's published SSH host key fingerprint (docs.github.com, "GitHub's SSH key fingerprints"). Checked before the
# first connection, so the server can't be tricked into trusting an impostor pretending to be github.com.
GITHUB_ED25519=SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU
TIMEZONE=Europe/Athens

# These match deploy/common.sh, which is only available after the repo is cloned (step 5).
APP_DIR=/opt/running-companion
APP_USER=companion
APP_HOME=/var/lib/running-companion
log() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  ✓ %s\n' "$*"; }
fail() {
  printf '\n  ✗ %s\n' "$*" >&2
  exit 1
}
pause() { read -rp "  $1 " _; }

[ "$(id -u)" = 0 ] || fail 'Run it with sudo: sudo bash setup.sh'
[ -t 0 ] || fail 'Run it in an interactive terminal: ssh -t ubuntu@<server IP> "sudo bash setup.sh"'
. /etc/os-release
[ "$ID" = ubuntu ] || fail "This script is for Ubuntu (found $PRETTY_NAME)."
LOGIN_USER=${SUDO_USER:-}
[ -n "$LOGIN_USER" ] && [ "$LOGIN_USER" != root ] || fail 'Log in as your normal user (ubuntu) and use sudo, not as root.'

# 1. SSH: key login only ------------------------------------------------------------------------------------------
log '1/9  SSH: key login only'
KEYS=/home/$LOGIN_USER/.ssh/authorized_keys
if ! grep -qE '^(ssh-ed25519|ssh-rsa|ecdsa-sha2)' "$KEYS" 2>/dev/null; then
  echo '  This server has no SSH key for you yet, so you logged in with a password.'
  # shellcheck disable=SC2016  # a PowerShell command to show, not to expand
  echo '  On your laptop, show your public key with:  Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub'
  read -rp '  Paste that one line here (it starts with ssh-ed25519): ' PUBKEY
  [[ $PUBKEY =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+ ]] || fail "That doesn't look like a public key. Nothing was changed."
  install -d -m 700 -o "$LOGIN_USER" -g "$LOGIN_USER" "/home/$LOGIN_USER/.ssh"
  echo "$PUBKEY" >>"$KEYS"
  chown "$LOGIN_USER:$LOGIN_USER" "$KEYS"
  chmod 600 "$KEYS"
  echo
  echo '  Before passwords are switched off, check the key works. In a NEW PowerShell window run:'
  echo "    ssh $LOGIN_USER@$(hostname -I | awk '{print $1}')"
  echo '  It should log you in without asking for the server password (it may ask for your key passphrase).'
  pause 'Did it work? Press Enter to continue, or Ctrl+C to stop here.'
fi
# 01- sorts before cloud-init's 50-cloud-init.conf: sshd uses the first value it reads for each setting.
cat >/etc/ssh/sshd_config.d/01-running-companion.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sshd -t || fail 'The SSH configuration is invalid; nothing was reloaded.'
systemctl reload ssh
ok 'Passwords and root login are off: only your key can log in'

# 2. System updates, firewall, time zone ----------------------------------------------------------------------------
log '2/9  System updates, firewall, time zone'
# No questions during upgrades: restart affected services automatically, keep existing config files.
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
APT_OPTIONS=(-y -qq -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)
apt-get update -qq
apt-get upgrade "${APT_OPTIONS[@]}" >/dev/null
apt-get install "${APT_OPTIONS[@]}" git curl ca-certificates xz-utils ufw unattended-upgrades sqlite3 >/dev/null
ok 'System up to date'
# Security updates install automatically (Ubuntu's default); if one needs a reboot, it happens at 04:00.
# The app is a service, so it starts again by itself after the reboot.
cat >/etc/apt/apt.conf.d/52running-companion <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
EOF
ok 'Automatic security updates on, reboots at 04:00 when needed'
# Only SSH comes in. The dashboard isn't opened at all: Tailscale reaches it from inside the server (step 7).
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
ufw --force enable >/dev/null
ok 'Firewall on: only SSH can come in'
timedatectl set-timezone "$TIMEZONE"
ok "Time zone $TIMEZONE"

# 3. App user ---------------------------------------------------------------------------------------------------------
log '3/9  App user'
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$APP_HOME" --create-home --shell /usr/sbin/nologin "$APP_USER"
fi
ok "The app runs as '$APP_USER': no password, no login, no admin rights"

# 4. Read access to the GitHub repo ------------------------------------------------------------------------------------
log '4/9  Read access to the GitHub repo'
DEPLOY_KEY=$APP_HOME/.ssh/id_ed25519
install -d -m 700 -o "$APP_USER" -g "$APP_USER" "$APP_HOME/.ssh"
if [ ! -f "$DEPLOY_KEY" ]; then
  sudo -u "$APP_USER" ssh-keygen -q -t ed25519 -N '' -C "running-companion server" -f "$DEPLOY_KEY"
fi
KNOWN=$APP_HOME/.ssh/known_hosts
if ! grep -q '^github.com ssh-ed25519' "$KNOWN" 2>/dev/null; then
  SCAN=$(ssh-keyscan -t ed25519 github.com 2>/dev/null)
  [ "$(ssh-keygen -lf - <<<"$SCAN" | awk '{print $2}')" = "$GITHUB_ED25519" ] || fail "github.com's key doesn't match GitHub's published fingerprint. Not connecting."
  echo "$SCAN" >>"$KNOWN"
  chown "$APP_USER:$APP_USER" "$KNOWN"
fi
until sudo -u "$APP_USER" -H git ls-remote "$REPO" HEAD >/dev/null 2>&1; do
  echo
  echo '  The server needs read-only access to your private repo. Add this key on GitHub:'
  echo "    1. Open $REPO_PAGE/settings/keys/new"
  echo '    2. Title: running-companion server'
  echo '    3. Key: paste this line'
  echo
  echo "       $(cat "$DEPLOY_KEY.pub")"
  echo
  echo '    4. Leave "Allow write access" unticked, then click "Add key".'
  pause 'Press Enter once it is added.'
done
ok 'The server can read the repo (and only read it)'

# 5. Code ---------------------------------------------------------------------------------------------------------------
log '5/9  Code'
if [ ! -d "$APP_DIR/.git" ]; then
  install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
  sudo -u "$APP_USER" -H git clone --quiet "$REPO" "$APP_DIR"
fi
install -d -m 700 -o "$APP_USER" -g "$APP_USER" "$APP_DIR/data" "$APP_DIR/.cache"
# shellcheck source=deploy/common.sh
source "$APP_DIR/deploy/common.sh"
as_app 'git fetch --quiet origin main && git reset --hard --quiet origin/main'
ok "Code at $APP_DIR ($(as_app 'git log -1 --format=%h'))"

# 6. Node and build -------------------------------------------------------------------------------------------------------
log '6/9  Node and build (a few minutes)'
install_node || fail 'Could not install Node.'
ok "Node $(node --version)"
build_app || fail 'Install, typecheck, tests or build failed. The output above says which.'
ok 'Installed, typechecked, tested and built'

# 7. Tailscale: the public HTTPS address ----------------------------------------------------------------------------------
log '7/9  Tailscale: the public HTTPS address'
if ! command -v tailscale >/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh >/dev/null
fi
if ! tailscale status >/dev/null 2>&1; then
  echo '  Tailscale prints a link next. Open it on your laptop and log in with the same account as on your laptop.'
  tailscale up --hostname=running-companion
fi
echo '  If Tailscale asks you to enable Funnel (the public address), open the link it prints and approve.'
tailscale funnel --bg 8787
DNS_NAME=$(tailscale status --json | node -e 'let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => console.log(JSON.parse(s).Self.DNSName.replace(/\.$/, "")))')
PUBLIC_URL="https://$DNS_NAME"
ok "Public address: $PUBLIC_URL"

# 8. Settings: Garmin key and dashboard password ---------------------------------------------------------------------------
log '8/9  Settings'
ENV_FILE=$APP_DIR/.env
[ -f "$ENV_FILE" ] || install -m 600 -o "$APP_USER" -g "$APP_USER" /dev/null "$ENV_FILE"
# KEY=value in .env, replaced or appended. awk reads the value from the environment, so no character in it needs escaping.
set_env() {
  KEY=$1 VALUE=$2 awk 'BEGIN { k = ENVIRON["KEY"]; v = ENVIRON["VALUE"] }
    index($0, k "=") == 1 { print k "=" v; done = 1; next } { print }
    END { if (!done) print k "=" v }' "$ENV_FILE" >"$ENV_FILE.tmp"
  cat "$ENV_FILE.tmp" >"$ENV_FILE"
  rm -f "$ENV_FILE.tmp"
}
if ! grep -qE '^GARMIN_PERSONAL_API_KEY=.+' "$ENV_FILE"; then
  echo '  Your Garmin key: https://connect.garmin.com/app/settings/personalApiToken'
  echo '  (Create a new one for the server, so the laptop and the server each have their own and either can be revoked.)'
  read -rsp '  Paste the Garmin key (hidden): ' GARMIN_KEY
  echo
  [ -n "$GARMIN_KEY" ] || fail 'No key entered.'
  set_env GARMIN_PERSONAL_API_KEY "$GARMIN_KEY"
  unset GARMIN_KEY
fi
set_env PUBLIC_URL "$PUBLIC_URL"
set_env HOST 127.0.0.1
set_env TRUST_PROXY true
set_env TZ "$TIMEZONE"
chown "$APP_USER:$APP_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"
as_app 'npm run --silent auth:check' || fail 'Garmin rejected the key. Run the script again to enter it again (delete the GARMIN_PERSONAL_API_KEY line in .env first).'
if ! grep -qE '^PASSWORD_HASH=.+' "$ENV_FILE"; then
  echo '  Now choose the dashboard password (a few words work well).'
fi
until grep -qE '^PASSWORD_HASH=.+' "$ENV_FILE"; do
  as_app 'npm run --silent set-password' || true
done
ok 'Settings saved in .env (readable only by the app)'

# 9. First sync, then start ---------------------------------------------------------------------------------------------------
log '9/9  First sync and start'
if [ ! -s "$APP_DIR/data/companion.db" ]; then
  echo '  Downloading your history from Garmin: all runs plus 3 months of health data. This takes a while.'
  as_app 'npm run --silent sync'
fi
install_units
systemctl enable --now running-companion.service >/dev/null 2>&1
systemctl restart running-companion.service
wait_healthy || fail 'The server did not start. See: journalctl -u running-companion -n 50'
as_app 'git rev-parse HEAD' >"$DEPLOYED_FILE"
systemctl enable --now running-companion-update.timer >/dev/null 2>&1
ok 'Running, and checking GitHub for updates every 5 minutes'

log 'Done'
cat <<EOF
  Dashboard:   $PUBLIC_URL
               (a new address can take a few minutes to work while its certificate is issued)

  Useful commands on the server:
    journalctl -u running-companion -f          the app's log, live
    journalctl -u running-companion-update      what the auto-update did
    sudo systemctl restart running-companion    restart the app
EOF
