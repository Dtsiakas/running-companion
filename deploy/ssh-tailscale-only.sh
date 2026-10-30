#!/usr/bin/env bash
# Optional, after setup: closes SSH to the internet and allows it only through Tailscale.
# Afterwards, log in from a device that's on your tailnet with:  ssh ubuntu@running-companion
# If you ever lock yourself out, OVH's control panel has a browser console (KVM) that works without SSH.
#
#   sudo bash /opt/running-companion/deploy/ssh-tailscale-only.sh

set -euo pipefail
[ "$(id -u)" = 0 ] || { echo 'Run it with sudo.' >&2; exit 1; }
ip link show tailscale0 >/dev/null 2>&1 || { echo 'Tailscale is not running on this server; nothing changed.' >&2; exit 1; }

echo 'Before closing public SSH, check that this works from your laptop (with Tailscale running there):'
echo '  ssh ubuntu@running-companion'
read -rp 'Did it log you in? Type yes to continue: ' answer
[ "$answer" = yes ] || { echo 'Nothing changed.'; exit 0; }

ufw allow in on tailscale0 to any port 22 proto tcp >/dev/null
ufw delete allow OpenSSH >/dev/null
echo '✓ SSH now only accepts connections through Tailscale.'
