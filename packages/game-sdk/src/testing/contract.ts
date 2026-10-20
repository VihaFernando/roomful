/**
 * Contract compliance suite every registered game module must pass.
 * Usage (in a *.test.ts): runGameContractSuite(myModule, { playerCounts: [3, 6] })
 */
import { describe, expect, test } from "bun:test";
import { isRejection, type AnyGameModule, type GameContext, type Step } from "../interfaces";
import type { PlayerRef } from "../types";
import { createSeededRandom } from "../utilities/random";

export interface ContractOptions {
  playerCounts: number[];
  /** Safety cap on simulated steps before we call the module non-terminating. */
  maxSteps?: number;
  seeds?: number[];
}

function players(n: number): PlayerRef[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, nickname: `Player ${i + 1}`, online: true }));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/**
 * Drives a module with random-but-plausible inputs: legal action types from
 * getAvailableActions with fuzzed payloads, plus timer firings.
 */
export function runGameContractSuite(module: AnyGameModule, opts: ContractOptions) {
  const { metadata } = module;
  const maxSteps = opts.maxSteps ?? 2000;
  const seeds = opts.seeds ?? [1, 2, 3];

  describe(`game contract: ${metadata.id}`, () => {
    test("metadata is sane", () => {
      expect(metadata.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(metadata.minPlayers).toBeGreaterThanOrEqual(1);
      expect(metadata.maxPlayers).toBeGreaterThanOrEqual(metadata.minPlayers);
    });

    test("default settings parse and round-trip", () => {
      const parsed = module.settingsSchema.parse({});
      expect(parsed).toEqual(module.defaultSettings);
      expect(module.settingsSchema.safeParse({ __junk: true }).success).toBe(false);
    });

    test("garbage actions are rejected by the schema", () => {
      for (const junk of [null, 1, "x", {}, { type: "__nope" }, []]) {
        expect(module.actionSchema.safeParse(junk).success).toBe(false);
      }
    });

    for (const n of opts.playerCounts) {
      for (const seed of seeds) {
        test(`plays to completion without mutating state (${n} players, seed ${seed})`, () => {
          const random = createSeededRandom(seed);
          let now = 1_000_000;
          const roster = players(n);
          const ctx = (): GameContext => ({ now, random, players: roster });
          const timers = new Map<string, number>();

          const apply = (step: Step<unknown>) => {
            for (const e of step.effects ?? []) {
              if (e.kind === "setTimer") timers.set(e.key, e.at);
              if (e.kind === "clearTimer") timers.delete(e.key);
            }
            return deepFreeze(step.state);
          };

          let state = apply(
            module.createInitialState(ctx(), {
              settings: module.defaultSettings,
              participants: roster,
              carryOver: undefined,
            }),
          );

          let steps = 0;
          while (!module.isComplete(state)) {
            if (++steps > maxSteps) throw new Error("module did not complete within maxSteps");
            // Views must be JSON-safe for every viewer.
            for (const p of roster) {
              JSON.stringify(module.getPublicView(state, p.id));
              JSON.stringify(module.getPrivateView(state, p.id));
            }
            const actor = roster[random.int(roster.length)]!;
            const types = module.getAvailableActions(state, actor.id);
            if (types.length > 0 && random.int(4) > 0) {
              const type = types[random.int(types.length)]!;
              const target = roster[random.int(roster.length)]!.id;
              const candidates = [{ type }, { type, text: `clue ${steps}` }, { type, targetId: target }];
              for (const raw of candidates) {
                const parsed = module.actionSchema.safeParse(raw);
                if (!parsed.success) continue;
                const result = module.handleAction(ctx(), state, actor.id, parsed.data);
                if (!isRejection(result)) state = apply(result);
                break;
              }
            } else if (timers.size > 0) {
              // Fire the earliest timer.
              const [key, at] = [...timers.entries()].sort((a, b) => a[1] - b[1])[0]!;
              timers.delete(key);
              now = Math.max(now, at);
              state = apply(module.handleTimer(ctx(), state, key));
            }
          }

          const outcome = module.calculateResults(state);
          const ids = new Set(roster.map((p) => p.id));
          for (const a of outcome.awards) expect(ids.has(a.playerId)).toBe(true);
          for (const w of outcome.winnerIds) expect(ids.has(w)).toBe(true);
        });
      }
    }

    test("private views are never shared across viewers", () => {
      const random = createSeededRandom(7);
      const roster = players(Math.max(metadata.minPlayers, 4));
      const step = module.createInitialState(
        { now: 0, random, players: roster },
        { settings: module.defaultSettings, participants: roster, carryOver: undefined },
      );
      const outsider = module.getPrivateView(step.state, "not-a-player");
      expect(outsider).toBeNull();
    });
  });
}
