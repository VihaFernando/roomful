# Roomful: party games for your people

Private, real-time party games played from everyone's phone. Make a room, share the six-character code, play.
Two games so far: **Imposter** (find the one who doesn't know the word) and **Mafia** (night kills, a Doctor, an
Investigator, day votes). The platform is game-agnostic, so new games plug in without touching rooms, sessions or
the protocol.

- **Runtime:** Bun everywhere (install, dev, test, build, production)
- **Server:** `Bun.serve` HTTP and native WebSockets, server-authoritative, Zod-validated
- **Web:** React 19, Vite, Tailwind CSS v4, Radix Dialog, lucide icons
- **Shared:** typed protocol and contracts (`@party/shared`), plus the game SDK (`@party/game-sdk`)

## Quick start

```bash
bun install
cp .env.example .env        # optional; defaults work for local dev
bun run dev                 # server on :3001, web on :5173 (also on your LAN IP)
```

Open http://localhost:5173. To play with real phones on the same Wi-Fi, open the "Network" URL that Vite prints.

| Command | What it does |
|---|---|
| `bun run dev` | Server (watch mode) and web dev server together |
| `bun run dev:server` / `bun run dev:web` | Run either one on its own |
| `bun test` | All tests: unit, game logic, real-server WebSocket integration, architecture rules |
| `bun run typecheck` | `tsc --noEmit` for every workspace |
| `bun run build` | `apps/web/dist` (static) and `apps/server/dist` (Bun bundle) |
| `bun run start` | Production server. Set `SERVE_WEB_DIST=true` to also serve the web app |

## Repository layout

```
apps/
  server/src/
    index.ts             boot (config → app → Bun.serve)
    app.ts               composition root; everything injectable (clock, random, scheduler)
    config/              zod-validated env
    http/                REST handlers + static file serving
    websocket/           gateway: auth, validation, rate limits, idempotency, duplicate sockets
    middleware/          token-bucket rate limiter
    security/            tokens, ids, room codes
    infrastructure/      clock/scheduler (real + fake), crypto random, redacting logger, errors
    modules/rooms        RoomService: membership, host rules, presence, lifecycle, publishing
    modules/sessions     resumable guest sessions (hashed tokens)
    modules/scoring      ScoreLedger (party scoreboard shared by all games)
    modules/games        GameRegistry
    game-engine/         MatchRunner: runs a GameModule, timers, per-viewer view diffing
    games/               ← game modules (imposter/, mafia/) and the registry list (index.ts)
  web/src/
    routes/              Home, Create, Join, Room (/r/:code), NotFound
    features/rooms       connection context + room shell (header, sheets, banners)
    features/lobby       code card, players, game picker, settings, start bar
    features/players     identity form + avatar set
    features/scoreboard  party scoreboard
    features/games/      ← game UIs (imposter/, mafia/), shared game parts (shared/), web registry (registry.ts)
    services/            HTTP api, RoomConnection (WebSocket + reconnect), storage
    components/          design-system primitives and layout
packages/
  shared/                protocol, schemas, contracts, game contracts (no secrets)
  game-sdk/              GameModule interface, helpers, contract test suite
tests/                   integration tests (real server + WS clients), architecture tests
docs/                    architecture, protocol, rules, deployment, adding a game
deploy/                  EC2 release script and its self-test
.github/workflows/       CI on every push; deploy to EC2 on v* tags
```

## Docs

- [Architecture](docs/ARCHITECTURE.md): how the pieces fit together, and the security model
- [Protocol](docs/PROTOCOL.md): the versioned WebSocket and HTTP contract
- [Adding a game](docs/ADDING_A_GAME.md): step-by-step guide for a second game
- [Imposter rules](docs/IMPOSTER_RULES.md): rules, tie-breaks and scoring
- [Mafia rules](docs/MAFIA_RULES.md): roles, night resolution, ties, chat channels and scoring
- [Deployment](docs/DEPLOYMENT.md): production build, reverse proxy, WSS
- [Plan & progress](PLAN.md)

## Environment

See [.env.example](.env.example). All variables are optional; the defaults suit local development. Only `VITE_*`
variables reach the browser, and none of them are secret.

## Known limitations

- **In-memory state.** Restarting the server closes every room and session. Storage sits behind `RoomStore` /
  `SessionStore` interfaces so Redis or a database can be added later. Nothing claims persistence today.
- **Single instance.** WebSocket rooms live in one process. Running several instances would need shared state,
  room-to-instance routing (sticky by room code) and pub/sub for fan-out. That is not implemented.
- **Guest identity is per device.** Clearing site data or switching browsers means joining as a new player.
- **English word lists only.** They're easy to extend in `apps/server/src/games/imposter/words/*.json`.
- **Voice and video are out of scope.** Play in person or on any call. Mafia has built-in text chat.
