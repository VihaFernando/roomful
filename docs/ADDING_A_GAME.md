# Adding a second game

You add files in three places and one line in each of two registries. No room, session, protocol, lobby or
scoring code changes. In the steps below, `<id>` is your game's kebab-case id, e.g. `word-chain`.

## 1. Contracts: `packages/shared/src/games/<id>/index.ts`
Put everything the server and web both need here. **No secrets** (word lists, answers, deck order).

```ts
import { z } from "zod";
export const WORD_CHAIN_ID = "word-chain";
export const wordChainSettingsSchema = z.object({ turnSeconds: z.number().int().min(10).max(60).default(20) }).strict();
export type WordChainSettings = z.infer<typeof wordChainSettingsSchema>;
export const wordChainActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("word.submit"), text: z.string().max(40) }).strict(),
]);
export type WordChainAction = z.infer<typeof wordChainActionSchema>;
export interface WordChainPublicView { phase: "playing" | "results"; turnId: string | null; chain: string[] }
export type WordChainPrivateView = null;
```

Then add the subpath export to `packages/shared/package.json`:
`"./games/word-chain": "./src/games/word-chain/index.ts"`.

## 2. Server module: `apps/server/src/games/<id>/module.ts`
Implement `GameModule` with `defineGame(...)` from `@party/game-sdk`. Rules of thumb:
- **Be pure.** Clone the incoming state (`structuredClone`), change the clone and return it. Never mutate the
  input.
- **Use only `ctx`.** Take time from `ctx.now` and randomness from `ctx.random` (crypto in production, seeded in
  tests). Never call `Date.now()` or `Math.random()`.
- **Timers are effects.** Return `{ kind: "setTimer", key, at }`, then handle the firing in
  `handleTimer(ctx, state, key)`.
- **Reject bad actions with `reject(code, message)`.** Messages are shown to users, so don't leak secrets through
  them.
- **Build public views field by field.** Never spread state into a public view. `getPrivateView` returns only
  that viewer's secrets, or `null`.
- **Handle presence.** `handlePresence(..., "left")` can return `{ kind: "abort", reason: "not_enough_players" }`.
- **Score through results.** `calculateResults` returns `{ headline, winnerIds, awards, carryOver? }`. The
  platform applies the awards to the party scoreboard.
- **You can't import platform code.** Modules may import only `@party/game-sdk`, `@party/shared` and their own
  files. A test enforces this.

## 3. Register it on the server: `apps/server/src/games/index.ts`
```ts
export const gameModules = [imposterModule, wordChainModule];
```

## 4. Web UI: `apps/web/src/features/games/<id>/`
- `Screen.tsx` reads the view with `useRoomState().game` (typed as `GameView<Pub, Priv>`) and sends actions with
  `useConnection().gameAction(action)`. Use the shared `Button`, `Sheet`, `Countdown` and similar components to
  stay on-brand.
- `SettingsForm.tsx` implements `GameSettingsFormProps<WordChainSettings>`: `editable` is false for non-hosts,
  and `onChange` sends the full settings object.
- `Rules.tsx` is a compact how-to-play panel. `Icon.tsx` is a 48×48 SVG mark.

## 5. Register it on the web: `apps/web/src/features/games/registry.ts`
```ts
[WORD_CHAIN_ID]: defineGameUI({ id: WORD_CHAIN_ID, Screen, SettingsForm, Rules, Icon, summarize }),
```

## 6. Test it
```ts
// apps/server/src/games/word-chain/module.test.ts
import { runGameContractSuite } from "@party/game-sdk/testing";
runGameContractSuite(wordChainModule, { playerCounts: [2, 4, 8] });
// …plus deterministic rule tests with createSeededRandom and a fake `now`.
```
The contract suite checks metadata, default settings, rejection of junk actions, that random play completes
without mutating frozen state, JSON-safe views, null private views for outsiders, and that awards and winners
are participants. `tests/integration.test.ts` shows how to drive a full match over real WebSockets.

That's it. The lobby lists the game automatically (from `/api/games`), the host can select and configure it, and
start, restart, end, reconnection, spectators and scoring all work through the platform.
