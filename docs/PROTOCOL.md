# Protocol v1

Source of truth: `packages/shared/src/events/` and `packages/shared/src/contracts/`.

## HTTP

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/health` | | `{ ok, uptimeSeconds }` |
| GET | `/api/games` | | `{ games: GameListing[] }` (metadata + default settings) |
| GET | `/api/rooms/:code` | | `{ code, playerCount, capacity, status, joinable }` (no names) |
| POST | `/api/rooms` | `{ nickname, avatarId }` | `201 { code, playerId, token }` |
| POST | `/api/rooms/:code/join` | `{ nickname, avatarId }` | `201 { code, playerId, token }` |

Errors: `{ error: { code, message } }`, with HTTP status mapped from `code` (`apps/server/src/infrastructure/errors.ts`).

## WebSocket

Endpoint: `/ws`. Text frames only, at most 8 KB each.

```ts
// client → server
{ v: 1, type: string, requestId?: string /* ≤64 chars */, payload: object }
// server → client
{ v: 1, type: string, replyTo?: string, payload: object }
```

1. Connect, then send `session.resume { token }` within 5 s, or the socket is closed with code `4401`.
2. Success: `session.resumed { playerId, room, game, serverTime }`. This is a full resync, and is also what
   reconnects receive.
3. Failure: `session.invalid { reason: expired | kicked | left | room_closed | unknown }`, then close `4403`.

Each request carrying a `requestId` gets exactly one reply with `replyTo` set: `ack {}`, or
`error { code, message }`. A repeated `requestId` from the same player within 2 minutes replays the original
reply instead of applying the request again.

### Client messages

| type | payload | who |
|---|---|---|
| `session.resume` | `{ token }` | anyone (first message) |
| `ping` | `{}` | anyone → `pong { serverTime }` |
| `room.leave` | `{}` | player |
| `room.setReady` | `{ ready }` | player |
| `room.updateProfile` | `{ nickname?, avatarId? }` | player, between games |
| `room.updateSettings` | `{ capacity?, requireAllReady? }` | host |
| `room.kick` | `{ playerId }` | host |
| `room.transferHost` | `{ playerId }` | host |
| `game.select` | `{ gameId }` | host |
| `game.updateSettings` | `{ gameId, settings }` | host (validated by the game's schema) |
| `game.start` | `{}` | host (blocked while `startBlocker` is set) |
| `game.action` | `{ action }` | player (validated by the game's `actionSchema`) |
| `game.restart` | `{}` | host, after a match completes |
| `game.end` | `{}` | host: aborts a running match, or closes results, and returns to the lobby |

### Server events

| type | payload | when |
|---|---|---|
| `session.resumed` | `{ playerId, room, game, serverTime }` | after resume |
| `session.invalid` | `{ reason }` | token unusable (left, kicked, expired, room closed) |
| `session.replaced` | `{}` | the same session connected elsewhere; this socket closes with `4409` |
| `room.snapshot` | `RoomSnapshot` | any room change (only sent when it changed) |
| `game.view` | `GameView` | this recipient's game view changed |
| `game.ended` | `{ matchId, reason: aborted \| not_enough_players }` | match stopped early |
| `notice` | `{ message }` | non-secret toast ("Sam is now the host.") |
| `ack` / `error` | `{}` / `{ code, message }` | replies |
| `pong` | `{ serverTime }` | reply to ping |
| `server.shutdown` | `{}` | graceful shutdown |

### State separation

- **`RoomSnapshot`** (public): players, host, settings, selected game and its settings, `startBlocker`, match
  summary (`participantIds`, `completed`, `results`), scoreboard.
- **`GameView.public`**: whatever the module's `getPublicView` returns for this viewer.
- **`GameView.private`**: only this viewer's secrets (`getPrivateView`). `null` for spectators.
- **`GameView.availableActions`**: action types this viewer may send right now (for UI only; the server
  re-validates everything).
- `endsAt` is server-clock epoch milliseconds. Clients render countdowns using the offset from `serverTime`.

### Close codes

`4401` auth timeout · `4403` session invalid · `4409` replaced · `4410` kicked · `4411` room closed ·
`4412` left · `4503` shutdown. Clients don't auto-reconnect after these. Any other close triggers a backoff
reconnect.

### Versioning

`v` is `PROTOCOL_VERSION` (currently `1`). A mismatched `v` gets
`error BAD_REQUEST "Unsupported protocol version"`. Breaking changes bump the version. Additive fields don't.
