# Deployment

## Build and run

```bash
bun install --frozen-lockfile
bun run build                       # apps/web/dist + apps/server/dist/index.js
SERVE_WEB_DIST=true PORT=3001 bun run start
```

`bun run start` runs `apps/server/dist/index.js` from `apps/server` with `NODE_ENV=production`, loading
`../../.env` if it exists. With `SERVE_WEB_DIST=true` the same process serves the SPA, with immutable caching for
hashed `/assets/*` and `index.html` as the fallback for client routes. That gives one origin, so no CORS
configuration is needed.

You can also host `apps/web/dist` on any static host or CDN and proxy `/api` and `/ws` to the server. Add the
static site's origin to `PUBLIC_ORIGIN`.

## Reverse proxy (HTTPS/WSS)

WebSockets need the `Upgrade` / `Connection` headers passed through, and a read timeout longer than the
heartbeat. Clients send an app-level ping every 15 s, and the server (Bun `sendPings`, `idleTimeout: 60`)
closes sockets that stay silent for 60 s. Set `TRUST_PROXY=true` only when a trusted
proxy sets `X-Forwarded-For`, otherwise rate limits could be spoofed.

**Caddy** (automatic TLS):
```
play.example.com {
  reverse_proxy 127.0.0.1:3001
}
```

**nginx**:
```nginx
map $http_upgrade $connection_upgrade { default upgrade; '' close; }
server {
  listen 443 ssl http2;
  server_name play.example.com;
  # ssl_certificate …; ssl_certificate_key …;
  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 75s;
  }
}
```

Browsers on `https://` automatically connect to `wss://<same host>/ws`.

## Automatic deploys: GitHub Actions → EC2

Two workflows in `.github/workflows/`:

| Workflow | Runs on | Does |
|---|---|---|
| `ci.yml` | every branch push and pull request | install → typecheck → tests → build → self-test of the release script (deploy, health check, rollback) |
| `deploy.yml` | pushing a tag `v*` | runs CI, packages the tested build, uploads it to EC2 over SSH, runs `deploy/remote-release.sh` |

**Releasing:**
```bash
git tag v1.2.0
git push origin v1.2.0
```
The live site updates about 2 minutes later. Pushing branches never deploys. Restarting ends any game in
progress (in-memory rooms), so tag when nobody is playing.

**What happens on the server** (`deploy/remote-release.sh`): the new `apps/server/dist` and `apps/web/dist`
replace the live ones inside `/home/ec2-user/roomful` (a copy of the current build is kept in `.deploy/previous`),
then `sudo systemctl restart roomful` runs and the script polls `http://127.0.0.1:$PORT/api/health` for up to
20 s. If the new build isn't healthy, the previous build goes back, the service restarts again, and the workflow
fails (you get an email).

The server bundle is self-contained, so nothing is installed or built on the box. The service, `.env` and Bun are
set up once by hand and the deploy never touches them.

### The existing install it expects (already in place)

- Amazon Linux, user `ec2-user` (passwordless `sudo`, the Amazon Linux default).
- App folder `/home/ec2-user/roomful`, config in `/home/ec2-user/roomful/.env`.
- `/etc/systemd/system/roomful.service` with `WorkingDirectory=/home/ec2-user/roomful/apps/server` and
  `ExecStart=/home/ec2-user/.bun/bin/bun --env-file=../../.env dist/index.js`.
- Caddy or nginx forwarding to `127.0.0.1:3001`.

A different folder or service name can be passed as `APP_DIR` / `SERVICE` to `remote-release.sh`.

### One-time setup for automatic deploys

1. **Deploy key** (in the server's terminal):
   ```bash
   ssh-keygen -t ed25519 -N "" -C github-deploy -f ~/roomful_deploy
   cat ~/roomful_deploy.pub >> ~/.ssh/authorized_keys
   cat ~/roomful_deploy                                                  # → EC2_SSH_KEY
   echo "<EC2_HOST> $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"  # → EC2_KNOWN_HOSTS
   ```
   After saving both in GitHub: `rm ~/roomful_deploy ~/roomful_deploy.pub`.
2. **SSH reachability.** GitHub's runners connect from changing IPs, so the instance's security group must allow
   port 22 from anywhere (`0.0.0.0/0`). Password login must stay off (key-only is the EC2 default).
3. **GitHub**: repository → **Settings → Environments → New environment** `production`, with these secrets:

   | Secret | Value |
   |---|---|
   | `EC2_HOST` | the instance's Elastic IP or DNS name |
   | `EC2_USER` | `ec2-user` |
   | `EC2_SSH_KEY` | the full private key printed in step 1 |
   | `EC2_KNOWN_HOSTS` | the host-key line printed in step 1 |

   Use an Elastic IP. A plain public IP changes when the instance stops, which breaks both secrets.

### Rolling back by hand
The build that was live before the last deploy is kept in `/home/ec2-user/roomful/.deploy/previous`:
```bash
cd /home/ec2-user/roomful
rm -rf apps/server/dist apps/web/dist
cp -a .deploy/previous/apps/server/dist apps/server/ && cp -a .deploy/previous/apps/web/dist apps/web/
sudo systemctl restart roomful
```
Or push a new tag from an older commit.

## Production checklist
- `NODE_ENV=production`, `SERVE_WEB_DIST=true` (or a static host plus proxy), `PUBLIC_ORIGIN=https://play.example.com`
- `TRUST_PROXY=true` behind your proxy
- Run **exactly one instance** (state is in memory, see README → Known limitations). Restarting ends every room.
  Deploy at quiet times.
- Send SIGTERM for a graceful stop: clients get `server.shutdown`, and rooms close cleanly.
- Health check: `GET /api/health`.
