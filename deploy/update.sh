#!/usr/bin/env bash
# Deploys the newest commit on GitHub's main branch, if it isn't the one running. Run every 5 minutes by
# running-companion-update.timer, as root (it restarts the service); git, npm and the build run as the app user.
#
# On any failure (install, typecheck, tests, build, or the new version not starting) it goes back to the last commit
# that worked, so a broken push never takes the dashboard down. Logs: journalctl -u running-companion-update
#
# Everything is inside main(), which bash reads completely before running it: `git reset` replaces this file
# mid-run when a commit changes it, and bash would otherwise continue reading from the new version.

main() {
  set -euo pipefail
  # shellcheck source=deploy/common.sh
  source /opt/running-companion/deploy/common.sh

  as_app 'git fetch --quiet origin main'
  local deployed target
  deployed=$(cat "$DEPLOYED_FILE" 2>/dev/null || true)
  target=$(as_app 'git rev-parse origin/main')
  [ "$deployed" = "$target" ] && exit 0
  # A commit that already failed isn't retried every 5 minutes; the next push is.
  [ "$(cat "$FAILED_FILE" 2>/dev/null || true)" = "$target" ] && exit 0

  log "Deploying $(as_app "git log -1 --format='%h %s' $target")"
  if deploy "$target"; then
    echo "$target" >"$DEPLOYED_FILE"
    rm -f "$FAILED_FILE"
    ok "Running ${target:0:7}"
    return
  fi

  echo "$target" >"$FAILED_FILE"
  [ -n "$deployed" ] || fail "The first deploy failed and there is no earlier version to go back to."
  warn "The new version failed. Going back to ${deployed:0:7}."
  deploy "$deployed" || fail "The previous version failed too. Check: journalctl -u $SERVICE"
  # Still exits with an error, so the failed deploy shows up in: systemctl list-units --failed
  exit 1
}

deploy() {
  as_app "git reset --hard --quiet $1" &&
    install_node &&
    build_app &&
    install_units &&
    systemctl restart "$SERVICE" &&
    wait_healthy
}

main "$@"
