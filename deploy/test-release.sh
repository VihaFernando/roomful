#!/usr/bin/env bash
# Self-test for remote-release.sh (run after `bun run build`; CI runs it on every push).
# Deploys the real build into a temp install with a fake `sudo systemctl restart`,
# then deploys a broken build and checks that the previous build is put back.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"
trap 'kill "$(cat "$T/pid" 2>/dev/null)" 2>/dev/null; sleep 1; rm -rf "$T" 2>/dev/null || true' EXIT
PORT=3999

mkdir -p "$T/app/apps/server" "$T/bin" "$T/good/apps/server" "$T/good/apps/web" "$T/bad/apps/server/dist" "$T/bad/apps/web/dist"
cp -r "$ROOT/apps/server/dist" "$T/good/apps/server/"
cp -r "$ROOT/apps/web/dist" "$T/good/apps/web/"
echo "v0.0.1 test" > "$T/good/VERSION"
echo 'process.exit(1)' > "$T/bad/apps/server/dist/index.js"
echo "v0.0.2 broken" > "$T/bad/VERSION"
tar -czf "$T/good.tgz" -C "$T/good" .
tar -czf "$T/bad.tgz" -C "$T/bad" .
printf 'HOST=127.0.0.1\nPORT=%s\nSERVE_WEB_DIST=true\nLOG_LEVEL=warn\n' "$PORT" > "$T/app/.env"

# Stand-in for `sudo systemctl restart roomful`, mirroring the real unit:
# WorkingDirectory=<app>/apps/server, ExecStart=bun --env-file=../../.env dist/index.js
cat > "$T/bin/sudo" <<EOF
#!/usr/bin/env bash
kill "\$(cat "$T/pid" 2>/dev/null)" 2>/dev/null && sleep 0.5 || true
cd "$T/app/apps/server"
NODE_ENV=production nohup bun --env-file=../../.env dist/index.js >> "$T/server.log" 2>&1 &
echo \$! > "$T/pid"
EOF
chmod +x "$T/bin/sudo"
export PATH="$T/bin:$PATH" APP_DIR="$T/app"

bash "$ROOT/deploy/remote-release.sh" v0.0.1 "$T/good.tgz"
curl -fsS "http://127.0.0.1:$PORT/api/games" | grep -q '"mafia"' || { echo "FAIL: new build not live" >&2; exit 1; }

if bash "$ROOT/deploy/remote-release.sh" v0.0.2 "$T/bad.tgz"; then
  echo "FAIL: a broken release was accepted" >&2; exit 1
fi
curl -fsS "http://127.0.0.1:$PORT/api/games" | grep -q '"mafia"' || { echo "FAIL: previous build not restored" >&2; exit 1; }
[[ -f "$T/app/apps/web/dist/index.html" ]] || { echo "FAIL: web build not restored" >&2; exit 1; }

if bash "$ROOT/deploy/remote-release.sh" 'v1;oops' "$T/good.tgz" 2>/dev/null; then
  echo "FAIL: accepted an unsafe tag" >&2; exit 1
fi
echo "release script OK: deploy, health check, rollback, tag validation"
