import {
  isRejection,
  type AnyGameModule,
  type GameContext,
  type GameOutcome,
  type PlayerRef,
  type Presence,
  type Random,
  type Rejection,
  type Step,
} from "@party/game-sdk";
import type { ErrorPayload, GameView } from "@party/shared";
import type { Logger } from "../infrastructure/logger";
import type { Clock, Scheduler, TaskHandle } from "../infrastructure/time";

export interface MatchDeps {
  clock: Clock;
  random: Random;
  scheduler: Scheduler;
  logger: Logger;
  /** Current room members as game-facing refs. */
  players: () => PlayerRef[];
}

export interface MatchHooks {
  /** State changed; the room should fan out views. */
  onChange(): void;
  onComplete(outcome: GameOutcome): void;
  onAbort(reason: "not_enough_players" | "internal_error"): void;
  onNotice(to: string[] | "all", message: string): void;
}

/**
 * Runs one match of one game module: owns the authoritative state, timers and
 * per-viewer view diffing. Knows nothing about rooms, sessions or sockets.
 */
export class MatchRunner {
  private state: unknown;
  private seq = 0;
  private timers = new Map<string, TaskHandle>();
  private lastSent = new Map<string, string>();
  private disposed = false;
  completed = false;
  outcome: GameOutcome | null = null;

  constructor(
    readonly matchId: string,
    readonly module: AnyGameModule,
    readonly participantIds: readonly string[],
    private readonly deps: MatchDeps,
    private readonly hooks: MatchHooks,
  ) {}

  get gameId() {
    return this.module.metadata.id;
  }

  start(settings: unknown, participants: PlayerRef[], carryOver: unknown) {
    const step = this.module.createInitialState(this.ctx(), { settings, participants, carryOver });
    this.apply(step);
  }

  /** Validates and applies a player's action. Returns an error payload on rejection. */
  act(playerId: string, rawAction: unknown): ErrorPayload | null {
    if (this.disposed || this.completed) return { code: "WRONG_PHASE", message: "This game has finished." };
    const parsed = this.module.actionSchema.safeParse(rawAction);
    if (!parsed.success) return { code: "INVALID_ACTION", message: "That action isn't valid." };
    let result: Step<unknown> | Rejection;
    try {
      result = this.module.handleAction(this.ctx(), this.state, playerId, parsed.data);
    } catch (err) {
      // Pure modules leave `this.state` untouched, so the match continues safely.
      this.deps.logger.error("game action threw", { gameId: this.gameId, matchId: this.matchId, err });
      return { code: "INTERNAL", message: "Something went wrong. Try again." };
    }
    if (isRejection(result)) return { code: result.code, message: result.message };
    this.apply(result);
    return null;
  }

  presence(playerId: string, presence: Presence) {
    if (this.disposed || this.completed || !this.participantIds.includes(playerId)) return;
    this.safely("presence", () => this.module.handlePresence(this.ctx(), this.state, playerId, presence));
  }

  /** The full view for one recipient (participant or spectator). */
  view(viewerId: string): GameView {
    const { id, endsAt } = this.module.getPhase(this.state);
    return {
      gameId: this.gameId,
      matchId: this.matchId,
      seq: this.seq,
      phase: id,
      endsAt,
      public: this.module.getPublicView(this.state, viewerId),
      private: this.module.getPrivateView(this.state, viewerId),
      availableActions: this.completed ? [] : this.module.getAvailableActions(this.state, viewerId),
    };
  }

  /** Views that differ from what each viewer last received. Marks them as sent. */
  changedViews(viewerIds: Iterable<string>): Array<[string, GameView]> {
    const out: Array<[string, GameView]> = [];
    for (const id of viewerIds) {
      const view = this.view(id);
      const key = JSON.stringify({ ...view, seq: 0 });
      if (this.lastSent.get(id) === key) continue;
      this.lastSent.set(id, key);
      out.push([id, view]);
    }
    return out;
  }

  /** Records that `viewerId` was just sent `view` out-of-band (e.g. on resume). */
  markSent(viewerId: string, view: GameView) {
    this.lastSent.set(viewerId, JSON.stringify({ ...view, seq: 0 }));
  }

  forgetViewer(viewerId: string) {
    this.lastSent.delete(viewerId);
  }

  dispose() {
    this.disposed = true;
    for (const t of this.timers.values()) this.deps.scheduler.cancel(t);
    this.timers.clear();
  }

  private ctx(): GameContext {
    return { now: this.deps.clock.now(), random: this.deps.random, players: this.deps.players() };
  }

  private fire(key: string) {
    this.timers.delete(key);
    if (this.disposed || this.completed) return;
    this.safely("timer", () => this.module.handleTimer(this.ctx(), this.state, key));
  }

  private safely(what: string, run: () => Step<unknown>) {
    let step: Step<unknown>;
    try {
      step = run();
    } catch (err) {
      // A broken timer/presence handler could leave the match stuck: stop it cleanly.
      this.deps.logger.error(`game ${what} handler threw`, { gameId: this.gameId, matchId: this.matchId, err });
      this.dispose();
      this.hooks.onAbort("internal_error");
      this.hooks.onChange();
      return;
    }
    this.apply(step);
  }

  private apply(step: Step<unknown>) {
    if (this.disposed) return;
    this.state = step.state;
    this.seq += 1;
    let complete = false;
    let abort = false;
    for (const effect of step.effects ?? []) {
      switch (effect.kind) {
        case "setTimer": {
          this.deps.scheduler.cancel(this.timers.get(effect.key));
          const key = effect.key;
          this.timers.set(key, this.deps.scheduler.at(effect.at, () => this.fire(key)));
          break;
        }
        case "clearTimer":
          this.deps.scheduler.cancel(this.timers.get(effect.key));
          this.timers.delete(effect.key);
          break;
        case "notice":
          this.hooks.onNotice(effect.to, effect.message);
          break;
        case "complete":
          complete = true;
          break;
        case "abort":
          abort = true;
          break;
      }
    }
    if (abort) {
      this.dispose();
      this.hooks.onAbort("not_enough_players");
    } else if (complete || this.module.isComplete(this.state)) {
      this.completed = true;
      for (const t of this.timers.values()) this.deps.scheduler.cancel(t);
      this.timers.clear();
      this.outcome = this.module.calculateResults(this.state);
      this.hooks.onComplete(this.outcome);
    }
    this.hooks.onChange();
  }
}
