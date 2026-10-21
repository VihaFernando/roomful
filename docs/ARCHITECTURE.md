# Architecture

## Principles

1. **The server is authoritative.** Clients send intents. The server validates them, applies them and sends
   back state. Clients never decide roles, scores, turns, timers or winners.
2. **Each recipient gets their own view.** Every message is built for its recipient. Secrets are never sent and
   then hidden with CSS.
3. **The platform knows nothing about any particular game.** Rooms, sessions, protocol, scoring and lobby have no
   Imposter-specific code. Games plug in through the `GameModule` contract.
4. **Time and randomness are injected.** Production uses `Date.now`, `setTimeout` and `crypto.getRandomValues`.
   Tests use a fake clock, a fake scheduler and a seeded PRNG, so game logic is fully deterministic.

## Request flow

```
Browser ──HTTP──▶ http-handler ──▶ RoomService.createRoom/joinRoom ──▶ { code, playerId, token }
Browser ──WS────▶ gateway.onMessage
                    size check → rate limit → JSON.parse → clientMessageSchema (zod)
                    → first message must be session.resume(token) → SessionService.resolve
                    → dispatch(type) → RoomService.<op>(code, playerId, payload)
                        ├─ room ops: membership, ready, settings, kick, host transfer
                        └─ game ops → MatchRunner.act → module.actionSchema.parse → module.handleAction
                    → reply ack | error (correlated by requestId; cached for idempotent retries)
RoomService.publish(room)
    room.snapshot  → every online member (one string; only sent when changed)
    game.view      → each member's own view, only when *their* view changed
```

## Packages and boundaries

| Package | May import | Never |
|---|---|---|
| `@party/shared` | `zod` | anything else (no secrets, no word lists) |
| `@party/game-sdk` | `@party/shared`, `zod` | server or web code |
| `apps/server/src/games/*` | `@party/game-sdk`, `@party/shared` | `modules/`, `websocket/`, `http/`, `game-engine/` |
| `apps/web` | `@party/shared` | `apps/server`, `@party/game-sdk` |

`tests/architecture.test.ts` enforces these rules.

## Core server concepts

- **Room.** A code, players (in join order), host, settings, the selected game, per-game settings, the per-game
  data carried between matches, the active `MatchRunner` and the `ScoreLedger`.
- **Player.** A seat with a nickname, avatar, ready flag and presence (`online` / `away`). Nothing game-specific.
- **Session.** A bearer token bound to one seat. Only the SHA-256 hash is stored. Sockets come and go; sessions
  persist until the player leaves, is kicked, times out or the room closes.
- **Presence and grace periods.** A closed socket marks the player `away`. After
  `PLAYER_RECONNECT_GRACE_MS` they're removed. If the host is away for `HOST_TRANSFER_GRACE_MS`, host passes to
  the earliest-joined online player. A newer socket for the same session replaces the old one (`session.replaced`).
- **Expiry.** A sweeper (every 30 s) deletes rooms with nobody online for `ROOM_EMPTY_TTL_MS`, and any room idle
  for `ROOM_IDLE_TTL_MS`.
- **MatchRunner.** Owns one match: the authoritative state, a timer per key (server clock only), the step
  counter (`seq`) and the last view sent to each viewer. If a module throws while handling an action, the action
  is rejected and the state is left as it was (modules are pure). If a timer or presence handler throws, the
  match is aborted cleanly instead of being left stuck.
- **ScoreLedger.** One party scoreboard per room. Games return `ScoreAward[]` and the platform applies them, so
  scores never live on the player model.

## Game module contract (summary)

See `packages/game-sdk/src/interfaces/index.ts` for the full typed interface.

```
metadata, settingsSchema, defaultSettings, validateSettings(settings, playerCount)
actionSchema
createInitialState(ctx, { settings, participants, carryOver })      → Step
handleAction(ctx, state, playerId, action)                           → Step | Rejection
handleTimer(ctx, state, key)                                         → Step
handlePresence(ctx, state, playerId, 'online'|'away'|'left')         → Step
getPhase(state), getPublicView(state, viewer), getPrivateView(state, viewer), getAvailableActions(state, viewer)
isComplete(state), calculateResults(state) → { headline, winnerIds, awards, carryOver }
Step = { state, effects?: setTimer | clearTimer | notice | complete | abort }
```

`GameContext` gives a module the current time, a `Random` source and read-only player refs. It offers no
access to rooms, sessions or sockets.

## Frontend

- `RoomConnection` (one per room tab) owns the socket. It authenticates with `session.resume`, reconnects with
  exponential backoff and jitter, reconnects immediately on `online` and `visibilitychange`, pings every 15 s
  (closing a half-open socket after 10 s without a pong), correlates requests by id, drops stale `game.view`
  frames using `seq`, and estimates the server clock offset for countdowns.
- State flows into React through `useSyncExternalStore` (no state library).
- Server state is never optimistically mutated. The only optimistic UI is local and reversible: the pending vote
  highlight and settings controls. Both snap back to whatever the server sends.
- The game UI registry (`features/games/registry.ts`) maps a game id to `{ Screen, SettingsForm, Rules, Icon }`.
  Game metadata (names, player counts) comes from the server registry via `/api/games`.

## Security notes

- 6-character codes from a 31-symbol alphabet (~887 million combinations), generated with crypto randomness.
  Collisions are retried, and lookups are rate-limited per IP.
- 256-bit session tokens, sent only as the first WebSocket frame and never in a URL. They're stored hashed.
- Every inbound payload is checked with Zod. WebSocket frames are capped at 8 KB and HTTP bodies at 4 KB.
- Token-bucket rate limits: room creation (5/min/IP), joins (20/min/IP), lookups, WebSocket messages (20/s per
  connection), and game actions (8 burst, 2/s per player).
- The `Origin` header is checked for WebSocket upgrades and state-changing POSTs (same host, or `PUBLIC_ORIGIN`).
- The logger redacts keys such as `token`, `word`, `role`, `text`, `guess`, `state` and `payload`. Game state is
  never logged.
- Imposter-specific protections include crew-only checks for clues that contain the word (so Imposters learn
  nothing from a rejection), a guess phase that reveals only counts, and role-neutral styling on shared screens.
- Mafia-specific protections: every living player picks at night (Villagers mark a suspect), so phones look the
  same. Night progress is public only as counts. Mafia whispers and ghost chat travel only in the private views
  of the players allowed to read them. The *Mafia* chat tab is shown only at night.

## Scaling path (not implemented)

1. Move `RoomStore` / `SessionStore` to Redis, with serializable match state (module state is already plain JSON).
2. Route each room code to one owner instance (consistent hashing or a lease in Redis). Sockets for a room must
   reach its owner, through a proxy keyed by room or by forwarding over pub/sub.
3. Replace `setTimeout` with a durable scheduler owned by the room's instance.
