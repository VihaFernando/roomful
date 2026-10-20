# Original Brief (verbatim requirements)

> Kept for reference. Decisions and progress are tracked in [../PLAN.md](../PLAN.md).

# Build a Premium Multiplayer Party Games Platform — Starting With Imposter

Act as a senior full-stack engineer, multiplayer game architect, and premium product UI/UX designer. Build a production-quality, real-time multiplayer party games web application where friends can create private rooms, invite friends using a room code, and play fun social games together.

The first playable game must be **Imposter**. However, the entire architecture must be designed from day one to support adding many more independent multiplayer games in the future without rewriting the core platform.

Do not build a basic prototype, generic dashboard, or AI-looking template. Build a polished, genuinely usable gaming product.

## 1. Mandatory technology stack

Use **Bun as the primary JavaScript/TypeScript runtime and tooling throughout the entire project**.

- Runtime and package manager: Bun.
- Language: TypeScript across frontend and backend.
- Frontend: React + Vite.
- Styling: Tailwind CSS with a consistent, reusable design system.
- UI components: Use well-maintained, accessible components where appropriate, with custom styling to achieve a distinctive product identity.
- Backend: Bun-native HTTP server with a cleanly structured API layer.
- Real-time multiplayer: WebSockets using Bun's native WebSocket capabilities where practical.
- Validation: Zod for API payloads, WebSocket messages, game settings, and runtime input validation.
- Shared contracts: A shared TypeScript package for event types, schemas, game metadata, and API contracts.
- Testing: Bun test runner for backend, game logic, and integration tests.
- Build tooling: Use Bun-compatible commands and scripts throughout.

Use Bun for installing dependencies, running development servers, testing, building, and production startup. Do not silently switch to Node.js, Express, npm, or another runtime.

If a dependency requires Node.js-specific functionality, evaluate its compatibility with Bun before adopting it.

Use stable, maintained libraries and current best practices compatible with the installed versions. Avoid unnecessary dependencies.

## 2. Repository and frontend/backend separation

Create a clean monorepo with independently organized frontend, backend, shared contracts, and game modules.

Suggested structure:

party-platform/
- apps/
  - web/
    - src/
      - app/
      - routes/
      - components/
      - features/
        - lobby/
        - rooms/
        - players/
        - games/
          - imposter/
      - hooks/
      - services/
      - styles/
      - assets/
  - server/
    - src/
      - http/
      - websocket/
      - middleware/
      - config/
      - modules/
        - rooms/
        - players/
        - sessions/
        - matchmaking/
        - games/
      - game-engine/
      - infrastructure/
      - security/
      - index.ts
- packages/
  - shared/
    - src/
      - contracts/
      - events/
      - schemas/
      - game-types/
      - constants/
  - game-sdk/
    - src/
      - types/
      - interfaces/
      - utilities/
- tests/
- docs/
- .env.example
- package.json
- bunfig.toml
- README.md

You may refine this structure if there is a technically better option, but maintain strict separation of responsibilities.

Requirements:
- Frontend and backend must be independently organized and independently runnable.
- The frontend must never import backend implementation code.
- Shared packages must contain only safe, reusable contracts and utilities.
- Do not put all game logic inside a single large component or server file.
- Do not mix UI, networking, game rules, and room management.
- Keep environment variables and secrets server-side.
- Provide clear development scripts for running both applications.
- Include a README explaining setup, architecture, and how to add another game.

## 3. Design the platform before implementing the game

Create a reusable platform foundation that all future games will use.

Implement these core concepts:

### Room management
- Create private rooms with unique, human-friendly six-character room codes.
- Validate codes and prevent collisions.
- Join an existing room using its code.
- Allow players to choose a nickname and avatar.
- Show all connected players in the lobby.
- Identify the host and visually distinguish them.
- Allow the host to select a game and configure its settings.
- Let the host start, restart, or end a game.
- Allow the host to remove a player when appropriate.
- Provide a clear way to leave a room.
- Show a ready state for players where applicable.
- Handle rooms becoming empty and implement a sensible expiration policy.
- Enforce configurable room capacity.

Start with a default capacity of 10 players, but make it configurable.

### Host and player permissions
- The room creator becomes the host.
- Only the host can change room-level settings, select games, and start or end a round.
- Validate all permissions on the backend.
- Support host transfer if the host disconnects permanently.
- Do not trust client-supplied host status, scores, player roles, or game outcomes.

### Reconnection
- Assign players stable session identities independent of temporary WebSocket connections.
- Support reconnecting after a network interruption or mobile browser suspension.
- Restore the player's room, game phase, and permitted game state.
- Handle duplicate connections and stale sessions.
- Keep a disconnected player reserved temporarily before considering them permanently gone.
- Handle refreshes, temporary offline states, and WebSocket reconnects gracefully.
- Do not accidentally create duplicate players after reconnection.

### Real-time communication
- Use a documented, typed WebSocket event protocol.
- Validate every incoming message.
- Use server-authoritative state changes.
- Broadcast only the information each recipient is allowed to see.
- Implement heartbeat/ping-pong, disconnect handling, and error responses.
- Ensure one player's invalid message cannot crash a room or the entire server.
- Keep room events scoped to the correct room.
- Avoid excessive broadcasts and unnecessary full-state updates.

Create reusable services for these features rather than implementing them separately inside Imposter.

## 4. CRITICAL: Build a modular game engine

The platform must be game-agnostic.

Do not hardcode Imposter-specific assumptions into the room system, player model, WebSocket protocol, scoring infrastructure, or lobby UI.

Create a formal Game Module / Game SDK interface that every game must implement.

Each game module should be able to define:
- Unique game ID and version.
- Display name, description, icon, category, and supported player count.
- Game settings schema and default settings.
- Validation of its settings.
- Its own phases and legal phase transitions.
- Game-specific actions and action validation.
- Initial state creation.
- Server-authoritative state updates.
- Per-player private state and public state.
- Timers and timeout handling.
- Disconnect and reconnect behavior.
- Round completion and victory conditions.
- Scoring rules.
- End-of-round results.
- Reset and cleanup behavior.
- Optional game-specific frontend screens and components.

Conceptually, use a contract similar to:

GameModule:
- metadata
- settingsSchema
- createInitialState(context)
- handleAction(context, action)
- getPublicState(state, viewer)
- getPrivateState(state, viewer)
- getAvailableActions(state, viewer)
- handlePlayerDisconnect(context, playerId)
- handlePlayerReconnect(context, playerId)
- checkCompletion(state)
- calculateResults(state)
- dispose(context)

Treat this as an architectural contract, not a requirement to use these exact method names. Adapt it to a strongly typed, maintainable design.

Important architectural rules:
- The backend owns all authoritative game state.
- Each game receives a scoped context rather than unrestricted access to unrelated internals.
- Games cannot arbitrarily modify room membership or other games.
- Private player information must never leak through public snapshots, logs, errors, or broadcasts.
- A game must declare and validate all its settings and actions.
- Invalid actions must be rejected without corrupting game state.
- Use a game registry to register and discover available game modules.
- The frontend must render the appropriate game interface using game metadata and registered game components.
- The lobby should display games from the registry rather than a hardcoded list of Imposter.
- Adding a new game should involve implementing a game module, registering it, and adding its frontend screens — not rewriting the room infrastructure.

Document the exact steps required to add a second game.

Do not build an elaborate plugin marketplace or dynamic code-loading system. A statically registered, strongly typed module architecture is sufficient and safer.

## 5. FIRST GAME: IMPOSTER

Implement a complete, genuinely playable social deduction game.

### Game concept

Everyone in the round receives the same secret word except the Imposter.

The Imposter receives a different instruction indicating that they are the Imposter, but never receives the secret word.

Players must give clues, identify the Imposter, and attempt to survive the voting phase.

### Game setup

- Support 3–10 players by default.
- The host configures the number of Imposters, subject to player-count validation.
- Start with one Imposter by default.
- Require at least two non-Imposter players.
- Include multiple built-in word categories, such as Food, Animals, Places, Objects, Movies, and Random.
- Allow the host to select one or more categories.
- Make the word collection easy to expand through structured data files.
- Avoid repeating recent words in the same room when possible.
- Keep the secret word and all role assignments exclusively on the server.

### Phase 1: Role reveal

Once the host starts a round:
- Assign roles randomly on the server using a reliable random source.
- Select a secret word from the enabled categories.
- Give every non-Imposter their private secret word.
- Give each Imposter their private Imposter instruction.
- Show a private role-reveal screen to each player.
- Reveal roles individually rather than displaying everyone's role in the lobby.
- Provide a clear tap-to-reveal interaction for mobile.
- Let players confirm they have viewed their role.
- Never send the secret word to an Imposter's browser, even as a hidden field or unused payload.
- Never send any other player's private role to the client.

The host must not have privileged access to secret words or roles unless the host is independently assigned that information as a player.

### Phase 2: Clue round

After all connected players have confirmed their role, begin the clue phase.

- Display the turn order clearly.
- Randomize the starting player each round.
- Let each player submit a short clue, one at a time.
- Allow the player to type a clue and submit it.
- Make submitted clues visible to all eligible players.
- Clearly show whose turn it is.
- Use a configurable turn timer, defaulting to 30 seconds.
- Automatically advance when a valid clue is submitted.
- Handle timeouts fairly and consistently.
- Prevent duplicate submissions, skipped turns, and out-of-turn actions.
- Ensure a reconnecting player cannot submit a clue twice.
- Give each player enough context to follow the game without excessive UI.

Optional setting: Allow the host to choose whether clues are text-only or displayed with player avatars.

Do not require voice chat. The game must work perfectly with text clues and be comfortable to play in a group call or in person.

### Phase 3: Discussion

After everyone has given a clue:
- Display all clues in turn order.
- Allow players to discuss who they suspect.
- Show a discussion countdown, default 45 seconds.
- Provide a clear transition to voting.
- The host must not be able to skip phases improperly or manipulate the outcome.

### Phase 4: Voting

- Every eligible player votes for one suspected Imposter.
- Players cannot vote for themselves.
- Votes remain private until the voting phase closes.
- Display who has voted without revealing their choice.
- Allow players to change their vote before the deadline.
- Prevent duplicate or invalid votes.
- Automatically reveal the result when all eligible players have voted or the timer expires.
- Use server-authoritative vote counting.
- Handle ties deterministically using a documented rule.
- Do not silently choose a winner through arbitrary array ordering.
- If a vote is tied, use a clear tie-breaker such as a revote between tied candidates. If the revote remains tied, end the round as inconclusive.

Make the voting interface easy to use with one hand on mobile.

### Phase 5: Results and victory

If the group identifies and eliminates an Imposter:
- Reveal the eliminated player's role.
- If multiple Imposters are enabled, continue according to the remaining-Imposter rules.
- Award victory to the non-Imposter team only when the configured victory condition is met.

If the group votes out a non-Imposter:
- Reveal that player's role.
- Allow the Imposter to continue, subject to the game's victory rules.

If the Imposter survives:
- Provide a configurable final opportunity for the Imposter to guess the secret word after a non-Imposter is eliminated.
- Make this setting optional.
- Validate the guess on the server.
- Reveal whether the guess was correct.
- Apply the configured victory condition consistently.

Use straightforward default rules and explain them in a compact rules screen before the first round.

At the end of a round:
- Reveal the secret word.
- Reveal all player roles.
- Display clues, voting statistics, and the outcome.
- Show the winning team.
- Award points using a documented, configurable scoring system.
- Provide a replay button.
- Allow the host to return to the lobby.
- Preserve the room and its player list for the next game.

Scoring must be centralized through a reusable scoring interface. Do not hardcode Imposter's scoring into the global player model.

## 6. UX, UI AND VISUAL DESIGN

The interface must look like a carefully designed, modern gaming product made by a strong product design team.

Do NOT create a generic AI-generated landing page.

### Visual direction

Use a distinctive, premium, playful visual identity that is readable and functional.

Recommended direction:
- Warm off-white or light neutral backgrounds.
- Dark charcoal typography.
- One confident accent color, such as electric orange, coral, or deep violet, used sparingly.
- Clean cards with subtle borders.
- Strong typographic hierarchy.
- Thoughtful spacing and alignment.
- Clear icons.
- Compact, well-designed player avatars.
- Polished game-specific illustrations only where they add value.
- Consistent radii, spacing tokens, typography, and component states.

Do not blindly follow these suggestions if a better cohesive design emerges, but maintain a recognizable design system.

### Absolutely avoid

- AI-style purple/blue gradients everywhere.
- Neon glows and glowing borders.
- Glassmorphism as a default style.
- Floating cards.
- Breathing or pulsing animations.
- Unnecessary animated backgrounds.
- Constant movement in the lobby.
- Overly rounded, childish UI.
- Generic template layouts.
- Excessive shadows.
- Huge empty hero sections that waste space.
- Excessive emojis as a substitute for real design.
- Decorative animations that delay gameplay.

The product should feel intentionally designed, not generated from a prompt.

### Required screens

1. Home / landing page.
2. Create room.
3. Join room using a room code.
4. Player identity setup.
5. Waiting lobby.
6. Game selection.
7. Game settings.
8. Imposter rules and introduction.
9. Private role reveal.
10. Clue submission.
11. Discussion.
12. Voting.
13. Results.
14. Persistent party scoreboard.
15. Reconnection and connection-loss states.
16. Empty, loading, error, and invalid-room states.

Make all screens visually consistent.

### Home page

Keep the home page focused:
- Strong product name and a memorable headline.
- A clear primary action to create a room.
- A clear secondary action to join a room.
- A preview of available games.
- A simple explanation of how playing works.

Do not spend most of the effort on a marketing website while leaving the actual game unfinished.

### Lobby design

The lobby should feel like friends are getting ready for a game:
- Room code prominently displayed with copy functionality.
- Shareable room invitation link.
- Player grid or responsive player list.
- Host badge.
- Connection status where useful.
- Ready states.
- Game selection cards.
- Settings panel.
- Start button with clear disabled-state explanations.
- Waiting state for players while the host configures the game.

Use restrained transitions to communicate state changes, not to decorate the screen.

## 7. MOBILE-FIRST PERFORMANCE AND PLAYABILITY

Mobile usability is a core requirement, not a responsive-design afterthought.

Design and test from a narrow viewport upward.

- Support modern iOS Safari and Android Chrome.
- Use fluid layouts and appropriate breakpoints.
- Ensure controls have touch targets around 44–48 CSS pixels or larger.
- Avoid horizontal overflow.
- Avoid tiny text and tightly packed controls.
- Respect safe-area insets on mobile.
- Use appropriate virtual keyboard behavior for clue entry.
- Prevent accidental double submissions.
- Make room codes easy to enter.
- Support paste into room-code fields.
- Avoid layouts that jump unexpectedly when the keyboard opens.
- Keep important actions within comfortable thumb reach.
- Provide visible pressed, disabled, success, and error states.
- Avoid hover-dependent functionality.
- Honor reduced-motion preferences.
- Keep animations short, purposeful, and inexpensive.
- Avoid unnecessary rerenders and repeated network traffic.
- Keep game state transitions immediate and predictable.

A player should be able to join a room, reveal a role, submit clues, vote, and view results comfortably on a phone.

Use optimistic UI only for reversible interactions where it is safe. Never optimistically reveal private roles, declare winners, or treat an unconfirmed server action as successful.

## 8. REAL-TIME STATE AND EVENT DESIGN

Create a documented, versioned event protocol.

Examples of client actions:
- room.create
- room.join
- room.leave
- room.updateSettings
- room.setReady
- game.select
- game.start
- game.action
- game.restart
- game.end
- session.resume

Examples of server events:
- room.created
- room.snapshot
- room.playerJoined
- room.playerUpdated
- room.playerLeft
- room.settingsUpdated
- room.hostChanged
- game.selected
- game.started
- game.privateState
- game.publicState
- game.phaseChanged
- game.actionAccepted
- game.actionRejected
- game.results
- session.reconnected
- session.expired
- server.error

These are examples, not an invitation to implement multiple competing event systems.

Design a consistent envelope with:
- Protocol version.
- Event type.
- Request ID or correlation ID where appropriate.
- Validated payload.
- Error code and safe error message where appropriate.

Implement:
- Typed event contracts.
- Runtime schema validation.
- Correlation of requests and responses.
- Action idempotency where necessary.
- Server-authoritative phase transitions.
- Per-player state filtering.
- Consistent error handling.
- Rate limiting for sensitive actions.
- Reconnection and resynchronization.
- A clear separation between public room state, public game state, and private player state.

Avoid broadcasting secret game state and relying on CSS or frontend logic to hide it.

## 9. SECURITY AND FAIRNESS

Implement sensible security for a real multiplayer application.

- Use cryptographically secure randomness for room codes and role assignments.
- Avoid predictable room codes and validate collisions.
- Validate all user input.
- Enforce nickname length and character restrictions.
- Prevent malicious payloads and oversized messages.
- Rate-limit room creation, joining, voting, and other abuse-prone actions.
- Prevent unauthorized room access and actions.
- Use server-authoritative scoring and results.
- Prevent players from voting twice or submitting out-of-turn clues.
- Do not expose secrets through frontend environment variables, public snapshots, errors, or logs.
- Do not trust client timestamps for timers.
- Do not trust client-reported roles, scores, or winners.
- Do not allow a client to directly overwrite room or game state.
- Prevent a player from sending actions on behalf of another player.
- Avoid logging private words, role assignments, session tokens, or sensitive payloads.

Use secure, high-entropy session tokens and store only the necessary session information. Keep secrets in server-side environment variables.

Do not introduce complex authentication unless required. The initial product should support frictionless guest play using nicknames and secure resumable sessions.

## 10. DATA STORAGE AND DEPLOYMENT READINESS

Design infrastructure so the game can initially run without an external database while keeping persistence replaceable.

For the first implementation:
- Use an in-memory room/session store behind well-defined interfaces.
- Store only what is necessary for the current active session.
- Use explicit cleanup and room expiration.
- Make the limitations of in-memory storage clear in the documentation.
- Define storage interfaces so Redis or a database can be added later without rewriting game logic.
- Do not claim that in-memory state survives server restarts.
- Do not add a database or Redis just for architectural appearance.

Structure the backend so a future multi-instance deployment can introduce shared state, distributed room ownership, and a pub/sub mechanism.

Do not pretend that WebSocket rooms will work across multiple server instances without shared coordination.

Use environment-based configuration and provide a complete .env.example.

Provide production build and startup commands for both frontend and backend. Document reverse-proxy requirements for WebSocket upgrades and HTTPS/WSS deployment.

## 11. TESTING REQUIREMENTS

Write meaningful automated tests, not placeholder tests.

Test:
- Room creation and code collisions.
- Joining, leaving, and room capacity.
- Host permissions and host transfer.
- Session reconnection and duplicate connections.
- Game registry behavior.
- Game module contract compliance.
- Role assignment and secret isolation.
- Clue turn order.
- Timeout handling.
- Invalid and duplicate actions.
- Voting and tie resolution.
- Victory conditions.
- Scoring.
- Cleanup and expiration.
- Malformed WebSocket payloads.
- Two or more independent rooms running simultaneously without cross-room leakage.

Include deterministic tests for game logic by injecting a controllable clock and random source into the game engine. Production randomness must remain secure.

Verify that private state for one player cannot be retrieved by another player or an Imposter.

## 12. IMPLEMENTATION WORKFLOW

Work directly in the current repository.

First inspect the existing files and determine whether there is already an application that needs to be preserved. Do not blindly overwrite existing work.

Then:

1. Establish the monorepo and Bun workspace configuration.
2. Create the shared contracts and game SDK.
3. Implement the room, session, player, and WebSocket infrastructure.
4. Implement the game registry and generic game lifecycle.
5. Implement the complete Imposter game on the server.
6. Implement the frontend design system and responsive screens.
7. Connect the UI to the real-time backend.
8. Implement reconnection, loading, error, and empty states.
9. Write and run automated tests.
10. Run type checking and production builds.
11. Fix errors instead of leaving broken scripts or placeholder functionality.
12. Document the setup and extension process.

Build working software, not just a plan, a Figma-like mockup, or static UI.

Do not stop after creating the home page. The full Imposter game must be playable between multiple separate browser sessions.

Do not use fake player data as a substitute for real multiplayer behavior. Seed data is acceptable for development demonstrations only when clearly separated from actual sessions.

If an architectural decision is uncertain, prefer the simplest maintainable implementation that satisfies the requirements.

## 13. DEFINITION OF DONE

The first release is complete only when:

- Two or more separate devices can join the same private room.
- Players can join using a room code.
- The lobby updates in real time.
- The host can configure and start Imposter.
- Each player receives only their own role and permitted information.
- Players can submit clues in order.
- Discussion and voting work correctly.
- Results and scoring are calculated by the server.
- The game can be replayed without recreating the room.
- Disconnecting and reconnecting does not unnecessarily destroy a player's session.
- Multiple rooms can run simultaneously without sharing private state.
- The interface works smoothly on mobile.
- Automated tests, type checking, and production builds pass.
- The repository contains clear instructions for adding future games.

Finally, provide a concise implementation summary listing:
1. What was built.
2. The final folder structure.
3. Commands to install, run, test, and build using Bun.
4. Environment variables required.
5. Known limitations.
6. Exactly how to add a second game without changing the platform core.

Prioritize correctness, modularity, smooth multiplayer gameplay, mobile usability, and thoughtful design over unnecessary complexity.
