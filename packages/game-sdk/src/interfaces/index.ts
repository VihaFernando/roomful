import type { z } from "zod";
import type { ErrorCode, GameMetadata, ScoreAward } from "@party/shared";
import type { PlayerRef, Presence, Random } from "../types";

/**
 * The scoped view of the world a game receives on every call.
 * It deliberately offers no access to rooms, sessions or sockets.
 */
export interface GameContext {
  /** Server time (epoch ms) for this step. Never trust client time. */
  readonly now: number;
  readonly random: Random;
  /** Current room members (participants and late joiners). */
  readonly players: ReadonlyArray<PlayerRef>;
}

export type GameEffect =
  /** Fire `handleTimer(key)` at server time `at`. Setting an existing key replaces it. */
  | { kind: "setTimer"; key: string; at: number }
  | { kind: "clearTimer"; key: string }
  /** Short, non-secret message shown as a toast. */
  | { kind: "notice"; to: string[] | "all"; message: string }
  /** The match is over; the engine will call `calculateResults`. */
  | { kind: "complete" }
  /** The match cannot continue (e.g. too few players). No scores are awarded. */
  | { kind: "abort"; reason: "not_enough_players" };

export interface Step<S> {
  state: S;
  effects?: GameEffect[];
}

export interface Rejection {
  rejected: true;
  code: Extract<ErrorCode, "INVALID_ACTION" | "NOT_YOUR_TURN" | "WRONG_PHASE" | "FORBIDDEN">;
  message: string;
}

export interface GameOutcome {
  headline: string;
  winnerIds: string[];
  awards: ScoreAward[];
  /** Opaque data kept by the room for the next match of this game (e.g. recently used words). */
  carryOver?: unknown;
}

export interface CreateInput<Settings> {
  settings: Settings;
  /** Players dealt into this match, in seat order. */
  participants: ReadonlyArray<PlayerRef>;
  /** Whatever the previous match of this game in this room returned as carryOver. */
  carryOver: unknown;
}

/**
 * Contract every game implements. Modules are pure: they must not mutate the
 * `state` they receive and must not hold references to outside objects.
 */
export interface GameModule<Settings, State, Action extends { type: string }, PublicView, PrivateView> {
  readonly metadata: GameMetadata;
  /** Parses raw (client-supplied) settings, filling defaults. */
  readonly settingsSchema: z.ZodType<Settings, unknown>;
  readonly defaultSettings: Settings;
  /** Player-count dependent checks. Returns a user-facing reason, or null if fine. */
  validateSettings(settings: Settings, playerCount: number): string | null;
  /** Parses raw `game.action` payloads. */
  readonly actionSchema: z.ZodType<Action, unknown>;

  createInitialState(ctx: GameContext, input: CreateInput<Settings>): Step<State>;
  handleAction(ctx: GameContext, state: State, playerId: string, action: Action): Step<State> | Rejection;
  handleTimer(ctx: GameContext, state: State, key: string): Step<State>;
  handlePresence(ctx: GameContext, state: State, playerId: string, presence: Presence): Step<State>;

  getPhase(state: State): { id: string; endsAt: number | null };
  /** What `viewerId` may see publicly. Build field by field; never spread state. */
  getPublicView(state: State, viewerId: string): PublicView;
  /** Only `viewerId`'s own secrets, or null if they hold none. */
  getPrivateView(state: State, viewerId: string): PrivateView | null;
  getAvailableActions(state: State, viewerId: string): Action["type"][];

  isComplete(state: State): boolean;
  calculateResults(state: State): GameOutcome;
}

// biome-ignore lint: erased type for registries
export type AnyGameModule = GameModule<any, any, any, any, any>;

export function isRejection(value: unknown): value is Rejection {
  return typeof value === "object" && value !== null && (value as Rejection).rejected === true;
}

export function reject(code: Rejection["code"], message: string): Rejection {
  return { rejected: true, code, message };
}

/** Identity helper that keeps full type inference for a module definition. */
export function defineGame<S, St, A extends { type: string }, Pub, Priv>(
  module: GameModule<S, St, A, Pub, Priv>,
): GameModule<S, St, A, Pub, Priv> {
  return module;
}
