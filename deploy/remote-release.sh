#!/usr/bin/env bash
# Runs on the EC2 host (uploaded by .github/workflows/deploy.yml).
# Swaps the built app (apps/server/dist + apps/web/dist) inside the existing
# install, restarts the `roomful` service and checks /api/health. If the new
# build isn't healthy, it puts the previous build back and fails the deploy.
#
# The install itself (the service, .env, Bun) is set up once by hand and never
# touched here. See docs/DEPLOYMENT.md.
set -euo pipefail

TAG="${1:?usage: remote-release.sh <tag> <archive>}"
ARCHIVE="${2:?usage: remote-release.sh <tag> <archive>}"
APP_DIR="${APP_DIR:-/home/ec2-user/roomful}"
SERVICE="${SERVICE:-roomful}"

[[ "$TAG" =~ ^v[0-9A-Za-z._-]+$ ]] || { echo "Refusing odd tag name: $TAG" >&2; exit 1; }

PORT="$(sed -n 's/^PORT=\([0-9]*\).*/\1/p' "$APP_DIR/.env" 2>/dev/null | tail -n1)"
PORT="${PORT:-3001}"
DIRS=(apps/server/dist apps/web/dist)
WORK="$APP_DIR/.deploy"
NEW="$WORK/new"
PREVIOUS="$WORK/previous"

healthy() {
  for _ in $(seq 1 20); do
    curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

# Moves each build folder from $1 into the live install.
install_from() {
  for d in "${DIRS[@]}"; do
    rm -rf "${APP_DIR:?}/$d"
    mkdir -p "$(dirname "$APP_DIR/$d")"
    mv "$1/$d" "$APP_DIR/$d"
  done
}

rm -rf "$NEW"
mkdir -p "$NEW"
tar -xzf "$ARCHIVE" -C "$NEW"
for d in "${DIRS[@]}"; do [[ -d "$NEW/$d" ]] || { echo "Archive is missing $d" >&2; exit 1; }; done
echo "Deploying $(cat "$NEW/VERSION")"

# Keep the build that is live right now, for rollback.
rm -rf "$PREVIOUS"
for d in "${DIRS[@]}"; do
  if [[ -d "$APP_DIR/$d" ]]; then
    mkdir -p "$(dirname "$PREVIOUS/$d")"
    cp -a "$APP_DIR/$d" "$PREVIOUS/$d"
  fi
done

install_from "$NEW"
sudo systemctl restart "$SERVICE"

if healthy; then
  rm -rf "$NEW"
  echo "Healthy on :$PORT. Deployed $TAG."
  exit 0
fi

echo "Health check failed for $TAG." >&2
if [[ -d "$PREVIOUS/apps/server/dist" ]]; then
  echo "Putting the previous build back." >&2
  install_from "$PREVIOUS"
  sudo systemctl restart "$SERVICE"
  healthy && echo "Previous build is serving again." >&2
fi
exit 1
