import { z } from "zod";
import { defineGame, reject } from "@party/game-sdk";

/**
 * Tiny test-only game used to prove the engine and rooms are game-agnostic.
 * Each player privately draws a coin; once everyone calls, the match completes.
 */
export interface CoinState {
  coins: Record<string, "heads" | "tails">;
  called: Record<string, boolean>;
  endsAt: number;
  done: boolean;
}

export const coinGame = defineGame<{ rounds: number }, CoinState, { type: "call" } | { type: "boom" }, { called: string[] }, { coin: string }>({
  metadata: {
    id: "coin",
    version: "0.0.1",
    name: "Coin",
    tagline: "test",
    description: "test game",
    icon: "coin",
    category: "other",
    minPlayers: 2,
    maxPlayers: 8,
    estimatedMinutes: [1, 1],
    allowsLateJoin: false,
  },
  settingsSchema: z.object({ rounds: z.number().int().min(1).max(3).default(1) }).strict(),
  defaultSettings: { rounds: 1 },
  actionSchema: z.discriminatedUnion("type", [z.object({ type: z.literal("call") }), z.object({ type: z.literal("boom") })]),
  validateSettings: () => null,
  createInitialState(ctx, { participants }) {
    const coins = Object.fromEntries(participants.map((p) => [p.id, ctx.random.int(2) ? "heads" : "tails"] as const));
    const endsAt = ctx.now + 10_000;
    return { state: { coins, called: {}, endsAt, done: false }, effects: [{ kind: "setTimer", key: "t", at: endsAt }] };
  },
  handleAction(_ctx, state, playerId, action) {
    if (action.type === "boom") throw new Error("kaboom");
    if (!(playerId in state.coins)) return reject("FORBIDDEN", "not playing");
    if (state.called[playerId]) return reject("INVALID_ACTION", "already called");
    const called = { ...state.called, [playerId]: true };
    const done = Object.keys(state.coins).every((id) => called[id]);
    return { state: { ...state, called, done } };
  },
  handleTimer(_ctx, state) {
    return { state: { ...state, done: true } };
  },
  handlePresence(_ctx, state, _playerId, presence) {
    return presence === "left" ? { state, effects: [{ kind: "abort", reason: "not_enough_players" }] } : { state };
  },
  getPhase: (s) => ({ id: s.done ? "done" : "calling", endsAt: s.done ? null : s.endsAt }),
  getPublicView: (s) => ({ called: Object.keys(s.called) }),
  getPrivateView: (s, id) => (s.coins[id] ? { coin: s.coins[id] } : null),
  getAvailableActions: (s, id) => (s.coins[id] && !s.called[id] && !s.done ? ["call"] : []),
  isComplete: (s) => s.done,
  calculateResults: (s) => ({
    headline: "done",
    winnerIds: Object.keys(s.coins).filter((id) => s.coins[id] === "heads"),
    awards: Object.keys(s.coins).map((id) => ({ playerId: id, points: s.coins[id] === "heads" ? 1 : 0, reason: "coin" })),
  }),
});
