# Party Platform — session guide

Real-time multiplayer party games platform (games: Imposter, Mafia). Bun + TypeScript monorepo.

## Start of every session
1. Read only §14 (Progress tracker) and §15 (Session log) of [PLAN.md](PLAN.md). Open other PLAN sections only when the task needs them.
2. Run `bun test` and `bun run typecheck` before changing anything.
3. At the end: tick items in §14 and add one row to §15 (what's done, exact next step).

## Commands
- `bun install` · `bun run dev` (server :3001 + web :5173) · `bun test` · `bun run typecheck` · `bun run build` · `bun run start`

## Layout & hard rules
- `apps/server` — Bun.serve HTTP + WS. Game logic in `apps/server/src/games/<id>/`.
- `apps/web` — React + Vite + Tailwind v4. Game UI in `apps/web/src/features/games/<id>/`.
- `packages/shared` (`@party/shared`) — zod schemas, protocol, contracts. Game contracts in `src/games/<id>/`.
- `packages/game-sdk` (`@party/game-sdk`) — GameModule interface + utilities.
- Web must NEVER import from `apps/server` (enforced by test). Shared must hold no secrets (word lists live server-side).
- Bun only — no npm/node/express. Zod for every external input.
- Game modules are pure reducers `(ctx, state, input) → { state, effects }`; never mutate input state.
- Never log words, roles, tokens, clues, guesses.
- Design: warm paper bg, ink text, one orange accent; no gradients/glows/glass/pulsing. Mobile-first, 48px targets.

## Docs
`docs/BRIEF.md` (original requirements) · `docs/PROTOCOL.md` · `docs/ADDING_A_GAME.md` · `docs/IMPOSTER_RULES.md` · `docs/MAFIA_RULES.md` · `docs/DEPLOYMENT.md`
