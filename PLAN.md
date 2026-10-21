# Party Platform — Master Plan

> Working plan for a real-time multiplayer party games platform (first game: **Imposter**).
> The full original requirements live in [docs/BRIEF.md](docs/BRIEF.md). This file is the source of truth for
> **decisions, architecture, and progress**. Update the progress tracker (§14) and the session log (§15) at the end
> of every working session.

---

## 0. How to resume work

1. Read §14 (Progress tracker) — find the first unchecked item.
2. Read §15 (Session log) — see what the last session left half-done.
3. Skim the decision records in §2 before changing architecture. If you change a decision, edit it here, don't fork it.
4. Run `bun install && bun test && bun run typecheck` to confirm the tree is green before starting.

---

## 1. Product summary

Friends create a private room (6-char code), share the code/link, pick nicknames + avatars, and play social games
together in real time from their phones. The platform (rooms, sessions, reconnection, protocol, scoring ledger, lobby)
is **game-agnostic**; each game is a statically registered, strongly typed module. Imposter is the first module.

Non-goals for v1: accounts/auth, voice chat, persistence across server restarts, multi-instance scaling,
plugin marketplace / dynamic code loading.

---

## 2. Key decisions (decision records)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Bun** everywhere: workspaces, `bun install`, `bun test`, `Bun.serve` HTTP + WebSocket, `bun build`. Vite runs under Bun for the web app. | Mandated. No Node/Express/npm. |
| D2 | Monorepo with Bun workspaces: `apps/web`, `apps/server`, `packages/shared`, `packages/game-sdk`. | Strict separation; web never imports server. |
| D3 | Game **server logic** lives in `apps/server/src/games/<game>/`. Game **contracts** (settings schema, action schemas, public/private view types) live in `packages/shared/src/games/<game>/`. Game **UI** lives in `apps/web/src/features/games/<game>/`. | Secrets (word lists, role logic) never reach the web bundle; both sides share types. |
| D4 | Game modules are **pure, reducer-style**: `(state, input, ctx) → { state, effects }`. The engine owns timers, broadcasting, scoring application. | Deterministic, easy to test, games can't touch room internals. |
| D5 | Inject `Clock` and `Random` into the engine. Production: `Date.now` + `crypto.getRandomValues`. Tests: fake clock + seeded PRNG. | Deterministic tests, secure prod randomness. |
| D6 | **HTTP for room create/join** (returns session token), **WebSocket for everything else**. First WS message must be `session.resume` with the token (token never in URL/query → not in proxy logs). | Easy IP rate limiting on create/join; one auth path for connect + reconnect. |
| D7 | Session token = 32 random bytes, base64url. Server stores **SHA-256 hash** of token → session. Client stores token in `localStorage` keyed by room code. | High entropy, a store dump doesn't leak usable tokens. |
| D8 | In-memory stores behind interfaces (`RoomStore`, `SessionStore`). No Redis/DB in v1. | Mandated; replaceable later. |
| D9 | Zod (v3/v4, whichever is current & Bun-compatible at install time) for every HTTP body, WS message, game settings, and game action. | Mandated. |
| D10 | Frontend state: a small custom store using `useSyncExternalStore` (no Redux/Zustand). Routing: `react-router` (data-less, simple routes). | Minimal deps. |
| D11 | Styling: Tailwind CSS v4 (`@tailwindcss/vite`) with design tokens defined via `@theme`. Primitives: Radix (`@radix-ui/react-dialog`, `react-switch`, `react-slider` only as needed). Icons: `lucide-react`. Fonts self-hosted via `@fontsource`. | Accessible primitives, custom identity. |
| D12 | In production the server can also serve `apps/web/dist` statically (single-origin deploy), but both apps remain independently runnable. | Simplest deploy; no CORS in prod. |
| D13 | Per-recipient state filtering happens **on the server** via `getPublicView` / `getPrivateView`. The client never receives data it shouldn't see. | Security requirement. |
| D14 | Score ledger is a platform service (`ScoreService`) per room. Games return `ScoreAward[]` in their results; the platform applies them. | No game-specific fields on the player model. |
| D15 | *(changed during build)* Room-level events are a single `room.snapshot` (only sent when its JSON changed) instead of granular playerJoined/settingsUpdated events. Game views stay per-recipient and diffed. | Room state is tiny and public; one event type removes a class of client sync bugs. See docs/PROTOCOL.md. |
| D16 | *(added)* Product name **Roomful**. Fonts: Bricolage Grotesque (display), Geist (body), Geist Mono (codes). | Distinct identity. |
| D17 | *(added)* Imposter public guess view shows counts only; shared-screen UI (reveal card, secret peek, clue prompts) is identical for every role. | Avoid revealing surviving Imposters, in protocol and by glance across a room. |
| D18 | *(added)* `tests/` is a Bun workspace (`@party/tests`); root scripts use `bun run --filter`. | Workspace resolution for integration tests; Bun `--cwd` form is not valid for `run`. |
| D19 | *(added 2026-10-21)* Second game **Mafia** (5–10 players). Rules researched and fixed in docs/MAFIA_RULES.md: auto Mafia count 1 (5–6) / 2 (7–10); split Mafia vote → random among leaders; Doctor self-save once + no consecutive repeat (both host settings); reveal role on death (setting, default on); dead Mafia don't vote; day tie → one revote, then nobody; no votes → nobody; 10-day cap → Mafia win. | Researched common rulesets; picked the most decisive, least stall-prone options. |
| D20 | *(added)* Mafia chat lives **inside the game module** as a `chat.send` action; channel (town / mafia / graveyard) is chosen server-side from phase, role and life. Mafia and ghost chat travel only in private views. Every living player picks at night (villagers "suspect"). | No protocol or platform change; secrets stay per viewer; phones look identical at night. |
| D22 | *(added 2026-10-21)* CI/CD with GitHub Actions: `ci.yml` on every push/PR; `deploy.yml` on `v*` tags only → ships the CI-tested bundle to EC2 over SSH; `deploy/remote-release.sh` swaps `apps/*/dist` inside the existing install (`/home/ec2-user/roomful`, Amazon Linux, `roomful` systemd unit), restarts, health-checks and restores the previous build on failure (self-tested in CI). | Restarts end live games (in-memory rooms), so deploys are deliberate; fits the server as already set up, nothing built on the box. |
| D21 | *(added)* Game palettes via token override: `.theme-night` on `<html>` redefines the colour tokens (no new components, no gradients, accent unchanged). Game `Screen`s are `React.lazy` chunks; common game parts live in `features/games/shared/`. | On-brand mood per game; main bundle stays ~146 KB gz while games are added. |

---

## 3. Repository layout

```
/
├─ apps/
│  ├─ web/                         React + Vite + Tailwind (client)
│  │  ├─ index.html
│  │  ├─ vite.config.ts            proxy /api and /ws → server in dev
│  │  └─ src/
│  │     ├─ app/                   App root, router, providers, error boundary
│  │     ├─ routes/                Home, Create, Join, Identity, Room (lobby+game host), NotFound
│  │     ├─ components/ui/         Button, Card, Input, CodeInput, Badge, Avatar, Sheet, Dialog, Timer, Toast…
│  │     ├─ components/layout/     AppShell, SafeArea, BottomActionBar, ConnectionBanner
│  │     ├─ features/
│  │     │  ├─ lobby/              PlayerGrid, RoomCodeCard, ShareInvite, ReadyToggle, StartBar
│  │     │  ├─ rooms/              create/join flows, room store slice
│  │     │  ├─ players/            identity form, avatar picker
│  │     │  ├─ scoreboard/         persistent party scoreboard
│  │     │  └─ games/
│  │     │     ├─ registry.ts      gameId → { Screen, SettingsForm, RulesPanel }
│  │     │     └─ imposter/        Imposter screens (reveal, clue, discuss, vote, results, settings, rules)
│  │     ├─ hooks/                 useRoom, useGameView, useCountdown, useReducedMotion, useCopy
│  │     ├─ services/              api.ts (HTTP), socket.ts (WS client w/ reconnect), session.ts (token storage)
│  │     ├─ styles/                index.css (Tailwind + @theme tokens)
│  │     └─ assets/                avatar SVGs, illustrations
│  └─ server/
│     └─ src/
│        ├─ index.ts               boot: config → stores → registry → Bun.serve
│        ├─ config/                env parsing (zod), defaults
│        ├─ http/                  router, handlers (health, games, rooms create/join/lookup), static serving
│        ├─ websocket/             upgrade, connection registry, message dispatch, heartbeat
│        ├─ middleware/            rate limiter (token bucket), body size limits, error mapping
│        ├─ security/              tokens, room codes, sanitize (nickname), secure random
│        ├─ infrastructure/        Clock, Random, in-memory stores, scheduler (timers), logger (redacting)
│        ├─ modules/
│        │  ├─ rooms/              RoomService (create/join/leave/kick/settings/ready/host transfer/expiry)
│        │  ├─ players/            Player model + identity validation
│        │  ├─ sessions/           SessionService (issue, resolve, bind connection, grace period)
│        │  ├─ scoring/            ScoreService (ledger per room)
│        │  └─ games/              GameRegistry, GameRunner (lifecycle per room)
│        ├─ game-engine/           engine glue: runs module reducers, timers, view fan-out, effects
│        └─ games/
│           └─ imposter/           module.ts, state.ts, phases/*.ts, words/*.json, scoring.ts
├─ packages/
│  ├─ shared/src/
│  │  ├─ constants/                PROTOCOL_VERSION, limits, room code alphabet, error codes
│  │  ├─ schemas/                  zod: identity, room settings, HTTP bodies
│  │  ├─ events/                   client→server & server→client envelopes + payload schemas
│  │  ├─ contracts/                HTTP API request/response types, RoomSnapshot, PlayerPublic
│  │  ├─ game-types/               GameMetadata, GameViewEnvelope (generic)
│  │  └─ games/imposter/           settings schema, action schemas, PublicView / PrivateView types
│  └─ game-sdk/src/
│     ├─ interfaces/               GameModule, GameContext, GameEffect, GameResult, ScoreAward
│     ├─ types/                    PlayerRef, Viewer, TimerRequest
│     └─ utilities/                shuffle(random), pickWeighted, phase-machine helper, assertNever
├─ tests/                          cross-package integration tests (real server + WS clients)
├─ docs/
│  ├─ BRIEF.md                     original requirements
│  ├─ ARCHITECTURE.md
│  ├─ PROTOCOL.md                  versioned event protocol reference
│  ├─ ADDING_A_GAME.md
│  ├─ IMPOSTER_RULES.md
│  └─ DEPLOYMENT.md                reverse proxy, WSS, env
├─ .env.example
├─ bunfig.toml
├─ package.json                    workspaces + root scripts
├─ tsconfig.base.json
└─ README.md
```

Import rules (enforced by a test that scans imports — see §11):
- `apps/web` may import `@party/shared` and type-only from `@party/game-sdk`. **Never** `apps/server`.
- `packages/shared` imports only `zod`. `packages/game-sdk` imports only `@party/shared` + `zod`.
- `apps/server/src/games/*` may import `@party/game-sdk`, `@party/shared`; **not** `modules/rooms` etc.

---

## 4. Platform domain model

```ts
Player   { id, nickname, avatarId, joinedAt, isHost (derived), ready, connection: 'online'|'away'|'gone', lastSeenAt }
Session  { id, tokenHash, roomCode, playerId, createdAt, lastSeenAt, connectionId? }
Room     { code, createdAt, lastActivityAt, hostId, players: Map, capacity, selectedGameId?,
           gameSettings: Record<gameId, unknown>, status: 'lobby'|'in-game'|'results',
           activeGame?: GameRunner, scores: ScoreLedger, recentHistory: Record<gameId, unknown> }
```

Rules:
- **Room code**: 6 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O/1/I/L), crypto random with rejection
  sampling; retry on collision (max 10 tries, then 503). Input is case-insensitive, whitespace/dash stripped.
- **Capacity**: default `ROOM_CAPACITY=10`, configurable per env; host can lower to ≥ game min.
- **Host**: creator. Transfer when host is `gone` (grace expired) or leaves → earliest-joined online player.
  Host can also hand over manually.
- **Presence**: socket closes → `away` (seat reserved for `PLAYER_RECONNECT_GRACE_MS`, default 120s) → `gone` →
  removed from room (game module notified via `onPlayerLeft`).
- **Kick**: host-only; kicked session is revoked; cannot rejoin same room with that token (may rejoin fresh unless
  room is in-game and locked — v1: kicked player can rejoin as new player only from lobby).
- **Joining mid-game**: allowed as a spectator-in-lobby; they join the next round. The game module decides whether
  late joiners participate (`allowsLateJoin` metadata, Imposter: false).
- **Expiry**: room with zero online players deleted after `ROOM_EMPTY_TTL_MS` (default 10 min). Any room idle
  > `ROOM_IDLE_TTL_MS` (default 6 h) deleted. Sweeper runs every 30 s. Sessions die with the room.
- **Nickname**: 1–20 chars after trim, letters/numbers/spaces/basic punctuation (Unicode letters allowed,
  control/zero-width chars stripped), unique per room (case-insensitive). Avatar from fixed preset list.
- **Ready**: players toggle ready in lobby; start requires min players, valid settings; ready is advisory by default
  (host sees "3/5 ready"), optional room setting `requireAllReady`.

---

## 5. Game SDK contract (packages/game-sdk)

```ts
interface GameMetadata {
  id: string; version: string; name: string; tagline: string; description: string;
  icon: string;               // key into web icon set
  category: 'deduction' | 'word' | 'drawing' | 'trivia' | 'other';
  minPlayers: number; maxPlayers: number; estimatedMinutes: [number, number];
  allowsLateJoin: boolean;
}

interface GameModule<S, St, A, Pub, Priv> {
  metadata: GameMetadata;
  settingsSchema: ZodType<S>;
  defaultSettings: S;
  validateSettings(settings: S, players: PlayerRef[]): ValidationResult; // player-count dependent checks
  actionSchema: ZodType<A>;                                               // discriminated union

  createInitialState(ctx: GameContext, settings: S, players: PlayerRef[]): Step<St>;
  handleAction(ctx: GameContext, state: St, playerId: string, action: A): Step<St> | Rejection;
  handleTimer(ctx: GameContext, state: St, timerKey: string): Step<St>;
  onPlayerDisconnected(ctx, state, playerId): Step<St>;
  onPlayerReconnected(ctx, state, playerId): Step<St>;
  onPlayerLeft(ctx, state, playerId): Step<St>;          // permanent

  getPublicView(state: St, viewer: Viewer): Pub;         // safe for this viewer's eyes
  getPrivateView(state: St, viewer: Viewer): Priv | null;// ONLY that viewer's secrets
  getAvailableActions(state: St, viewer: Viewer): A['type'][];
  getPhase(state: St): { id: string; endsAt?: number };
  isComplete(state: St): boolean;
  calculateResults(state: St): GameResult;               // outcome summary + ScoreAward[]
  carryOver?(state: St): unknown;                        // e.g. recent words, stored per room
  dispose?(state: St): void;
}

type Step<St> = { state: St; effects?: GameEffect[] };
type GameEffect =
  | { kind: 'setTimer'; key: string; ms: number }
  | { kind: 'clearTimer'; key: string }
  | { kind: 'notify'; to: string | 'all'; message: string }   // toast-style, non-secret
  | { kind: 'complete' };
type Rejection = { rejected: true; code: string; message: string };

interface GameContext {      // scoped — no room/session/socket access
  now(): number;
  random: Random;             // int(max), shuffle(arr), pick(arr)
  players: ReadonlyArray<PlayerRef>;  // id, nickname, avatarId, online
  carriedOver: unknown;       // from previous rounds in this room (recent words)
}
```

Engine (`apps/server/src/game-engine`) responsibilities:
- Validate action payload with `actionSchema` → call module → on `Rejection` reply `game.actionRejected` and
  **leave state unchanged** (state treated immutably; modules return new state objects; wrap in try/catch —
  an exception rejects the action and logs a redacted error, never crashes the room).
- Apply effects: timers via `Scheduler` (server clock only), completion → `calculateResults` → ScoreService.
- After every successful step: compute per-viewer views, **diff against last sent view per viewer** (cheap JSON
  string compare) and send only to viewers whose view changed.
- Idempotency: every client action carries `requestId`; engine keeps an LRU of the last 50 requestIds per player and
  replays the previous ack for duplicates.

---

## 6. WebSocket protocol (v1)

Envelope (both directions):
```ts
ClientMessage = { v: 1, type: string, requestId?: string, payload: unknown }
ServerMessage = { v: 1, type: string, replyTo?: string, payload: unknown }
ErrorPayload  = { code: ErrorCode, message: string /* safe, user-facing */ }
```
Limits: max frame 8 KB (`maxPayloadLength`), per-connection rate 20 msgs/s burst 40; first message must be
`session.resume` within 5 s or socket closes (4401).

Client → server:
| type | payload | who |
|---|---|---|
| `session.resume` | `{ token }` | anyone |
| `room.leave` | `{}` | player |
| `room.updateSettings` | `{ capacity?, requireAllReady? }` | host |
| `room.setReady` | `{ ready }` | player |
| `room.updateProfile` | `{ nickname?, avatarId? }` | player (lobby only) |
| `room.kick` | `{ playerId }` | host |
| `room.transferHost` | `{ playerId }` | host |
| `game.select` | `{ gameId }` | host |
| `game.updateSettings` | `{ gameId, settings }` | host |
| `game.start` | `{}` | host |
| `game.action` | `{ action }` (validated by module) | player |
| `game.restart` | `{}` | host (from results) |
| `game.end` | `{}` | host (abort → lobby, no scores) |
| `ping` | `{}` | anyone (app-level; Bun also does WS ping) |

Server → client:
| type | payload |
|---|---|
| `session.resumed` | `{ playerId, room: RoomSnapshot, game?: GameViewEnvelope }` (full resync) |
| `session.invalid` | `{ reason: 'expired'|'kicked'|'room_closed'|'unknown' }` |
| `session.replaced` | sent to old socket when the same session connects elsewhere; old socket closed (4409) |
| `room.snapshot` | full `RoomSnapshot` (on big changes) |
| `room.playerJoined` / `room.playerUpdated` / `room.playerLeft` | `PlayerPublic` / patch / `{ playerId, reason }` |
| `room.hostChanged` | `{ hostId }` |
| `room.settingsUpdated` | room settings |
| `game.selected` / `game.settingsUpdated` | `{ gameId, settings }` |
| `game.started` | `{ gameId, matchId }` |
| `game.view` | `{ matchId, phase, endsAt?, public, private?, availableActions, seq }` — **per recipient** |
| `game.actionAccepted` / `game.actionRejected` | `{ replyTo, … }` / `ErrorPayload` |
| `game.results` | `{ matchId, result, scoreboard }` |
| `game.ended` | `{ reason: 'completed'|'aborted' }` |
| `ack` / `error` | generic reply to `requestId` |
| `pong` | `{ serverTime }` (client uses it to compute clock offset for countdowns) |

Notes:
- `game.view` merges public+private for one recipient — simplest correct option; `seq` lets the client drop stale
  frames. Phase changes are just view changes with a new `phase`.
- Timers: server sends absolute `endsAt` (server time); client renders countdown using `serverTime` offset from
  `pong`. Client time is never trusted.
- Error codes: `BAD_REQUEST, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, ROOM_FULL, ROOM_LOCKED, NICKNAME_TAKEN,
  RATE_LIMITED, INVALID_ACTION, NOT_YOUR_TURN, WRONG_PHASE, INTERNAL`.

HTTP API:
| method | path | body → response |
|---|---|---|
| GET | `/api/health` | `{ ok, uptime }` |
| GET | `/api/games` | `GameMetadata[]` (+ default settings) |
| GET | `/api/rooms/:code` | `{ exists, playerCount, capacity, status, joinable }` (no player names) |
| POST | `/api/rooms` | `{ nickname, avatarId }` → `{ code, token, playerId }` |
| POST | `/api/rooms/:code/join` | `{ nickname, avatarId }` → `{ code, token, playerId }` |

Rate limits (token bucket per IP): create 5/min, join 20/min, lookup 60/min. In-WS: votes/clues 5 per 5 s per player.

---

## 7. Imposter — rules & module design

### 7.1 Settings (shared zod schema, defaults in **bold**)
| setting | range | default |
|---|---|---|
| `imposterCount` | 1–3, must leave ≥ 2 crew, and imposters < crew | **1** |
| `categories` | ≥1 of `food, animals, places, objects, movies, random` | **all except random** |
| `clueSeconds` | 15–90 | **30** |
| `discussionSeconds` | 15–180 | **45** |
| `voteSeconds` | 15–120 | **45** |
| `clueRoundsPerCycle` | 1–3 | **1** |
| `victoryMode` | `oneVote` \| `elimination` | **oneVote** (forced to `elimination` when imposterCount > 1) |
| `imposterGuess` | `off` \| `onSurvive` | **onSurvive** |
| `showClueAvatars` | bool | **true** |
| `revealSeconds` | fixed 60 (auto-advance safety) | — |

### 7.2 Phases
`reveal → clues → discussion → voting → (revote) → voteResult → (imposterGuess) → [next cycle → clues | results]`

1. **reveal** — server picks word (secure random, from enabled categories, avoiding the room's last 30 words via
   `carriedOver`) and assigns imposters (secure shuffle). Crew private view: `{ role:'crew', word, category }`.
   Imposter private view: `{ role:'imposter', category? (setting: hint category, default true), fellowImposters? }`
   — **no word field at all**. Advance when all *online* players confirmed `reveal.ack`, or after 60 s.
2. **clues** — turn order = shuffled alive players with random starting index each cycle. Current player may
   `clue.submit { text }` (1–40 chars, single line, trimmed, must not contain the secret word for crew — server
   checks normalized form; rejection message is generic "Clue not allowed" for imposters too, so it leaks nothing).
   Timeout → record `{ skipped: true }` and advance. Out-of-turn / second submission → `NOT_YOUR_TURN`.
   Disconnected player's turn: timer still runs (fair & consistent); if they're `gone`, skip immediately.
3. **discussion** — all clues shown in order; countdown. Alive players may `discussion.readyToVote`; if all online
   alive players are ready, advance early. Host has **no** skip power.
4. **voting** — alive players `vote.cast { targetId }` (not self, target must be alive). Can change until close.
   Public view shows *who has voted*, never targets. Closes when all online alive players have voted or timer ends.
   Count: plurality of cast votes. Abstentions don't count.
   - Unique top → that player eliminated.
   - Tie (incl. zero votes = everyone tied) → **revote** among tied candidates (tied candidates can still vote,
     but not for themselves). Revote tie again → **inconclusive**: nobody eliminated.
   - Deterministic: no array-order tie-breaking anywhere. Documented in IMPOSTER_RULES.md.
5. **voteResult** — reveal eliminated player's role (only theirs).
6. **imposterGuess** (if `imposterGuess = onSurvive` and a crew member was eliminated or inconclusive):
   each alive imposter gets one `guess.submit { text }` (30 s). Server compares normalized (case, accents,
   whitespace, simple plural `s`). Correct guess → bonus (oneVote) / immediate imposter win (elimination mode).
7. **victory check**
   - `oneVote`: imposter eliminated → **crew wins**; otherwise (crew eliminated or inconclusive) → **imposters win**.
   - `elimination`: all imposters out → crew wins; alive imposters ≥ alive crew → imposters win; correct guess →
     imposters win; else new cycle (same word, eliminated players spectate: they see public view + own role,
     cannot clue/vote). Hard cap: 4 cycles → imposters win.
8. **results** — reveal word, all roles, all clues per cycle, vote tallies per vote, outcome, winning team,
   score awards. Host: **Play again** (same room, same players, new word) or **Back to lobby**.

### 7.3 Scoring (configurable table in module, applied via ScoreService)
| event | points |
|---|---|
| Crew team wins | +2 each crew member (alive or not) |
| Crew member voted for an imposter in the deciding vote | +1 |
| Imposter team wins | +3 each imposter |
| Imposter guesses the word correctly | +2 |
| Imposter survives an inconclusive vote | (covered by team win) |

### 7.4 Secret isolation checklist (tested)
- Word & role map only in server state; `getPublicView` built field-by-field (no spreading state).
- Imposter's private view type has **no** `word` key; test asserts serialized JSON for every imposter view in
  every phase doesn't contain the word (case-insensitive).
- Logs: logger redacts `word`, `role`, `token`, `guess`, `text` keys; game state is never logged.
- Error messages are generic and identical for crew/imposter.
- Results view (end) reveals everything — only after `results` phase.

### 7.5 Word data
`apps/server/src/games/imposter/words/<category>.json` → `{ "category": "food", "label": "Food", "words": [...] }`,
~60–100 words each, validated by zod at boot; a test ensures no duplicates and no empty strings.

---

## 8. Frontend design system

**Direction:** warm, editorial, tactile — "a well-made board game box", not a SaaS dashboard.

Tokens (Tailwind `@theme`):
- Colors: `paper #F6F2EA` (bg), `card #FFFDF8`, `line #E4DDD0`, `ink #1D1B18`, `ink-muted #6B655C`,
  `accent #FF5A1F` (electric orange, used sparingly: primary CTA, current turn, timer warning),
  `accent-ink #FFFFFF`, `crew #2F6F5E` (deep green), `imposter #B3261E` (brick red), `warn #C98A00`.
  Dark mode: optional later (not v1).
- Type: display **Bricolage Grotesque** (700/800), body **Geist** or **Inter Tight** — pick at install, self-hosted.
  Scale: 12 / 14 / 16 / 18 / 22 / 28 / 36 / 48. Room codes in tabular monospace (**Geist Mono / JetBrains Mono**).
- Radius: `sm 6px`, `md 10px`, `lg 14px` (no pill-everything). Borders 1px `line`; shadows: one subtle
  `0 1px 0 line, 0 2px 6px rgba(29,27,24,.06)` max.
- Spacing: 4-pt grid. Touch targets ≥ 48px. Bottom action bar with `env(safe-area-inset-bottom)`.
- Motion: 120–180 ms ease-out for state changes only; `prefers-reduced-motion` → none. No pulsing, glowing,
  floating, gradients, glassmorphism.
- Avatars: 16 preset geometric avatars (SVG: simple shape + pattern + palette color) with initials fallback.
  No emoji-as-design.
- Component states: default / pressed (translate-y 1px + darker) / disabled (with reason text) / loading / success /
  error — documented in a `/dev/ui` route (dev-only) for visual QA.

Screens (all mobile-first, 360px base):
1. Home — wordmark, headline, Create (primary) + Join (secondary w/ inline code field), games preview from
   `/api/games`, 3-step "how it works".
2. Create room → identity step → lobby.
3. Join — 6-cell code input (paste support, auto-uppercase, `inputmode="text"`, `autocapitalize="characters"`),
   live lookup (`/api/rooms/:code`) with not-found / full / in-game states. Deep link `/r/:code`.
4. Identity — nickname + avatar grid; remembered in localStorage.
5. Lobby — RoomCodeCard (copy code, copy link, native share), player grid (host crown badge, ready check,
   away indicator), game picker cards (from registry), settings panel (host editable, others read-only),
   sticky Start bar with disabled reasons ("Need 1 more player", "Waiting for Sam to be ready").
6. Game selection & 7. Game settings — in-lobby sheets.
8. Imposter rules — compact rules sheet; shown automatically before a player's first round, reopenable.
9. Role reveal — card face-down, press-and-hold or tap to flip; "Got it" confirm; others see "4/6 ready".
10. Clue — turn order strip, current player highlight, clue list; input pinned above keyboard using
    `visualViewport` (avoid layout jumps), submit disables on send until server ack.
11. Discussion — clue recap grouped by player, countdown, "Ready to vote".
12. Voting — large tappable player rows in thumb zone, selected state, change vote, "voted" chips.
13. Results — outcome banner (team color), word reveal, roles list, clue + vote breakdown, score deltas,
    Play again / Back to lobby (host), "Waiting for host" (others).
14. Scoreboard — persistent party standings (sheet accessible from lobby & results).
15. Connection states — top banner: "Reconnecting…", "You're offline", "Connection lost — Retry";
    others see a player as "away".
16. Empty/loading/error/invalid-room — dedicated components, plus a top-level error boundary.

Frontend networking:
- `socket.ts`: connect → send `session.resume` → exponential backoff reconnect (0.5s → 8s, jitter); reconnect on
  `visibilitychange`/`online`; app-level ping every 15 s; resync from `session.resumed` full snapshot.
- Requests return promises resolved on `ack`/`actionAccepted`/`actionRejected` by `requestId` (timeout 8 s).
- No optimistic reveals/winners. Only optimistic: ready toggle and vote selection highlight (reverted on reject).

---

## 9. Server runtime details

- `Bun.serve({ fetch, websocket: { open, message, close, maxPayloadLength: 8192, idleTimeout: 60,
  sendPings: true } })`.
- Per-socket data: `{ connectionId, ip, sessionId?, bucket }`. Room fan-out via our own connection registry
  (not Bun topics for per-player views; Bun `publish` may be used for pure-public events).
- Duplicate connection: newest wins; old socket gets `session.replaced` and is closed.
- Every handler wrapped: zod parse → permission check → service call → reply. Exceptions → `INTERNAL` reply,
  redacted log line, room untouched.
- Room operations serialized per room (single-threaded JS + no `await` inside state mutation critical sections).
- `Scheduler`: wraps `setTimeout` with the injected clock; fake scheduler in tests advances time manually.
- Graceful shutdown on SIGINT/SIGTERM: stop accepting, notify sockets (`server.shutdown`), close.

---

## 10. Configuration (`.env.example`)

```
NODE_ENV=development            # development | production | test
HOST=0.0.0.0
PORT=3001
PUBLIC_ORIGIN=http://localhost:5173   # allowed Origin for WS/HTTP (comma-separated)
SERVE_WEB_DIST=false            # true in single-origin prod deploys
WEB_DIST_PATH=../web/dist
ROOM_CAPACITY=10
ROOM_EMPTY_TTL_MS=600000
ROOM_IDLE_TTL_MS=21600000
PLAYER_RECONNECT_GRACE_MS=120000
HOST_TRANSFER_GRACE_MS=30000
TRUST_PROXY=false               # read X-Forwarded-For for rate limiting when behind a proxy
LOG_LEVEL=info
# web (Vite): only non-secret values
VITE_WS_PATH=/ws
```

---

## 11. Testing plan (`bun test`)

Unit / module (fake clock + seeded random):
- security: room code alphabet/length/uniqueness, collision retry, token entropy & hash lookup, nickname sanitizer.
- rooms: create, join, capacity, duplicate nickname, leave, kick, host transfer on leave & on grace expiry,
  empty-room expiry, idle expiry, settings permissions.
- sessions: resume, invalid token, duplicate connection replacement, grace period → gone, no duplicate player on
  reconnect, kicked session rejected.
- registry: register, duplicate id rejected, metadata listing, settings validation via module.
- **contract compliance suite** (`game-sdk/testing/contract.ts`) run against every registered module: initial state,
  rejects garbage actions without state change, views are JSON-serializable, private view null for non-players,
  completes within N random legal actions, results include awards for known players only.
- imposter: role assignment counts, word never in imposter views (all phases), crew views don't contain other roles,
  turn order + random start, out-of-turn & double clue rejected, clue timeout skip, word-in-clue rejected,
  reveal auto-advance, discussion early advance, vote rules (self-vote, dead target, change vote), tie → revote →
  inconclusive, victory in both modes, imposter guess normalization, scoring table, recent-word avoidance,
  reconnect mid-turn can't double submit, player leaves mid-game.
- engine: rejection leaves state identical, exception in module doesn't crash, per-viewer diffing, idempotent
  requestId.

Integration (`tests/`, real `Bun.serve` on random port + WS clients):
- full Imposter match with 4 clients end-to-end; malformed JSON / oversized frame / unknown type / wrong version;
  two simultaneous rooms — no message crosses rooms, no secret leaks (scan every frame received by each client);
  reconnect mid-game restores phase + private view; rate limiting.
- Architecture test: scan `apps/web/src` imports — fail if anything resolves into `apps/server`.

Manual QA checklist (docs): 3 phones + 1 desktop, iOS Safari background/foreground, Android Chrome keyboard,
airplane-mode reconnect, reduced motion.

---

## 12. Scripts (root `package.json`)

```
bun install
bun run dev            # server (bun --watch) + web (vite) concurrently (via a tiny bun script, no extra deps)
bun run dev:server
bun run dev:web
bun test               # all tests
bun run typecheck      # tsc -b across workspaces
bun run lint           # (optional) biome or eslint — decide in Phase 1; keep deps minimal
bun run build          # web: vite build; server: bun build --target=bun
bun run start          # production: bun apps/server/dist/index.js (serves web dist if SERVE_WEB_DIST=true)
```

---

## 13. Implementation phases

Each phase ends with: tests green, typecheck green, progress tracker updated.

- **P1 Foundation** — workspaces, tsconfig base/references, bunfig, scripts, `.env.example`, README skeleton,
  dev runner script.
- **P2 Shared contracts + Game SDK** — constants, zod schemas, event envelopes, HTTP contracts, GameModule
  interfaces, utilities (secure-agnostic Random interface, shuffle), contract test harness.
- **P3 Server infrastructure** — config, Clock/Random/Scheduler, logger with redaction, stores, security utils,
  rate limiter, RoomService, SessionService, ScoreService, HTTP routes, WS gateway + heartbeat, tests.
- **P4 Game engine + registry** — GameRegistry, GameRunner lifecycle (select/settings/start/action/timer/restart/
  end), view fan-out with diffing, idempotency, tests with a tiny test-only "Coin Flip" dummy module (lives in
  tests, proves engine is game-agnostic).
- **P5 Imposter server** — word data, settings, state machine, all phases, scoring, isolation tests, integration
  test of a full match.
- **P6 Web foundation** — Vite+Tailwind setup, tokens, fonts, UI kit, app shell, router, api/socket/session services,
  room store, connection banner, `/dev/ui` gallery.
- **P7 Platform screens** — home, create, join (code input), identity, lobby (players, code/share, ready, game picker,
  settings, start bar), scoreboard, empty/error/invalid states.
- **P8 Imposter screens** — rules, reveal, clues (keyboard-safe input), discussion, voting, vote result, guess,
  results, spectator state.
- **P9 Resilience** — reconnect flows, visibility handling, stale view handling, duplicate tab, kicked/expired UX.
- **P10 Hardening & QA** — run full test suite, typecheck, prod build, manual multi-browser playtest, mobile checks,
  accessibility pass (focus, labels, contrast), performance pass (re-renders, frame sizes).
- **P11 Docs** — README, ARCHITECTURE, PROTOCOL, ADDING_A_GAME, IMPOSTER_RULES, DEPLOYMENT (nginx/Caddy WS upgrade
  config, WSS), known limitations, final summary.

---

## 14. Progress tracker

Status 2026-10-21: **v1 feature-complete + Mafia.** All phases P1–P12 done except the items marked ☐ below.

### P1 Foundation
- [x] Root `package.json` (workspaces incl. `tests`), scripts via `bun run --filter`
- [x] `tsconfig.base.json` + per-package tsconfigs (`bun run typecheck` checks each)
- [x] `bunfig.toml`, `.env.example`, `.gitignore`, `.gitattributes`
- [x] `scripts/dev.ts` (server + web together), `scripts/typecheck.ts`
- [x] git init + commits

### P2 Shared + SDK
- [x] constants, identity/room-code schemas, event envelopes, HTTP + room contracts
- [x] Imposter contracts (settings, actions, views)
- [x] GameModule / GameContext / effects / results, utilities, contract test suite (`@party/game-sdk/testing`)

### P3 Server infrastructure
- [x] config, clock/scheduler (real + fake), crypto random, redacting logger, errors
- [x] ids/tokens/room codes, rate limiter, in-memory stores
- [x] RoomService, SessionService, ScoreLedger, HTTP handler (+ static serving), WS gateway, sweeper

### P4 Engine + registry
- [x] GameRegistry, MatchRunner (timers, view diffing, error isolation), idempotent requestIds
- [x] test-only Coin game proving the engine is game-agnostic

### P5 Imposter server
- [x] word lists (6 × 60), settings validation, all phases, revote/inconclusive, guess, both victory modes, scoring
- [x] secret-isolation tests, full-match + two-room WS integration tests

### P6–P9 Web
- [x] design tokens, UI kit, avatars, app shell, router, error boundary
- [x] api / RoomConnection (reconnect, ping, clock offset, request correlation) / storage
- [x] Home, Create, Join (code input), Identity, Lobby (code/share, players, host tools, game picker, settings, start bar), Scoreboard
- [x] Imposter: rules, reveal, clues, discussion, voting/revote, vote result, guess, results, spectator/eliminated states
- [x] connection banner, kicked / closed / replaced / invalid-room / not-found / loading states
- [ ] `/dev/ui` component gallery — dropped (browser QA script covers visual checks)

### P10 Hardening
- [x] 118 tests green, typecheck green, production build + start verified (SPA fallback, traversal blocked)
- [x] Automated multi-browser playthrough (4 isolated Chrome contexts, phone viewport) incl. reload mid-game, replay, kick, guess path
- [ ] Manual QA on real iOS Safari + Android Chrome devices (keyboard behaviour, background/foreground)
- [ ] Accessibility audit with a screen reader

### P11 Docs
- [x] README, ARCHITECTURE, PROTOCOL, ADDING_A_GAME, IMPOSTER_RULES, DEPLOYMENT

### P12 Mafia (second game)
- [x] Rules research + decisions (D19–D21), docs/MAFIA_RULES.md
- [x] Shared contract `@party/shared/games/mafia` (settings, actions, public/private views)
- [x] Server module: reveal → night → morning → discussion → voting/revote → voteResult, victory, day cap, chat channels, presence, scoring
- [x] 47 module tests (contract suite, isolation, night resolution, Doctor rules, ties, chat, presence, scoring) + WS integration test scanning town frames
- [x] Web UI: reveal, night (all roles + ghosts), morning (private findings), discussion chat, voting (+chat sheet), vote result, results replay, settings, rules, icon
- [x] Night palette (`theme-night`), lazy game screens, shared game parts (Imposter refactored onto them)
- [x] Browser playthrough (5 phone contexts, prod build): no console errors; fixed day-time "Mafia" chat tab leak and composer overlap
- [ ] Real-device playtest with 7–10 people (balance of 2 Mafia at 10 players, discussion length)

### P13 CI/CD
- [x] `.github/workflows/ci.yml`, `.github/workflows/deploy.yml` (tag-triggered), `deploy/remote-release.sh`, `deploy/test-release.sh`, docs/DEPLOYMENT.md setup guide
- [ ] One-time EC2 + GitHub environment setup (docs/DEPLOYMENT.md), then first tag `v1.0.0`
- [ ] Confirm first CI run is green on GitHub (release-script self-test only runs on Linux)

### Ideas / next
- Mafia extras: optional Godfather (reads as town), Jester, last words for the eliminated, voice chat
- Second game (follow docs/ADDING_A_GAME.md) to validate the SDK for real — done (Mafia)
- Reduce web bundle (~150 KB gz; zod → `zod/mini` on the client)
- "Not connected yet" vs "Reconnecting" label for players who joined but never opened a socket
- Optional host "lock room" toggle

---

## 15. Session log

| date | what happened | next step |
|---|---|---|
| 2026-10-20 | Repo empty; Bun 1.4.2 available. Wrote PLAN.md and docs/BRIEF.md. | Start P1 Foundation. |
| 2026-10-20 | Built everything P1–P11: shared/sdk, server, Imposter, web UI, tests (118), docs. Browser QA with puppeteer-core (scratchpad, not in repo) found & fixed: role-revealing colours on shared screens, guess phase exposing Imposter ids, desktop lobby width. | Real-device mobile QA; then a second game. |
| 2026-10-21 | Added **Mafia** (P12): contract, server module, 48 new tests (166 total, green), web UI with night palette + chat, lazy game screens, shared game parts, docs/MAFIA_RULES.md. Platform untouched apart from a Suspense wrapper in RoomShell. Browser QA passed after two fixes. | Playtest Mafia with 7–10 real phones; tune timers/Mafia count from feedback. |
| 2026-10-21 | Added CI/CD (P13): CI on every push, tag-triggered EC2 deploy that swaps the built folders in the existing install, health-checks and auto rolls back (verified locally with deploy/test-release.sh and in CI). | Do the one-time EC2/GitHub setup in docs/DEPLOYMENT.md, push, check CI is green, then `git tag v1.0.0 && git push origin v1.0.0`. |

---

## 16. How a second game will be added (verified — see docs/ADDING_A_GAME.md)

1. `packages/shared/src/games/<id>/` — settings schema, action schema, public/private view types; export from index.
2. `apps/server/src/games/<id>/` — implement `GameModule`; keep data files beside it.
3. Register in `apps/server/src/games/index.ts` (one line in the registry array).
4. `apps/web/src/features/games/<id>/` — `Screen` (renders `game.view`), `SettingsForm`, `RulesPanel`, icon.
5. Register in `apps/web/src/features/games/registry.ts` (one line).
6. Add the module to the contract-compliance test list (automatic if the test iterates the registry).
No changes to rooms, sessions, protocol, lobby, or scoring infrastructure.

## 17. Known limitations (planned, to be documented)

- In-memory state: server restart drops all rooms and sessions.
- Single instance only; multi-instance needs shared store + room-affinity routing or pub/sub (interfaces ready).
- No accounts; identity is per-room session in localStorage (clearing storage = new player).
- Word lists English-only in v1.
