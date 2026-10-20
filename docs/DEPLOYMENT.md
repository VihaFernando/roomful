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

## Production checklist
- `NODE_ENV=production`, `SERVE_WEB_DIST=true` (or a static host plus proxy), `PUBLIC_ORIGIN=https://play.example.com`
- `TRUST_PROXY=true` behind your proxy
- Run **exactly one instance** (state is in memory, see README → Known limitations). Restarting ends every room.
  Deploy at quiet times.
- Send SIGTERM for a graceful stop: clients get `server.shutdown`, and rooms close cleanly.
- Health check: `GET /api/health`.
