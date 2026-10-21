/**
 * Mafia phase machine. Every function mutates a *draft* (a fresh clone made by
 * the module entry points) and appends effects. See docs/MAFIA_RULES.md.
 */
import type { GameContext, GameEffect } from "@party/game-sdk";
import {
  CHAT_HISTORY_LIMIT,
  MAFIA_FIXED_MS,
  MAX_DAYS,
  teamOf,
  type ChatChannel,
  type MafiaResultsReveal,
  type MafiaTeam,
} from "@party/shared/games/mafia";
import { activeMafia, activePlayers, activeTown, isActive, onlineActive, type MafiaState } from "./state";

export const PHASE_TIMER = "phase";

export type Fx = GameEffect[];

function setPhase(s: MafiaState, ctx: GameContext, fx: Fx, phase: MafiaState["phase"], ms: number) {
  s.phase = phase;
  s.phaseMs = ms;
  s.phaseEndsAt = ctx.now + ms;
  fx.push({ kind: "setTimer", key: PHASE_TIMER, at: s.phaseEndsAt });
}

/** True when at least one online active player exists and all of them satisfy `done`. */
function everyoneOnline(s: MafiaState, done: (id: string) => boolean): boolean {
  const ids = onlineActive(s);
  return ids.length > 0 && ids.every(done);
}

/** Seat-ordered tallies of `ballots` restricted to `candidates`, most votes first. */
export function tally(s: MafiaState, ballots: Record<string, string>, candidates: string[]) {
  const counts = new Map<string, number>(candidates.map((id) => [id, 0]));
  for (const target of Object.values(ballots)) {
    if (counts.has(target)) counts.set(target, counts.get(target)! + 1);
  }
  return [...counts.entries()]
    .map(([targetId, count]) => ({ targetId, count }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count || s.seats.indexOf(a.targetId) - s.seats.indexOf(b.targetId));
}

// ---------------------------------------------------------------- reveal

export function enterReveal(s: MafiaState, ctx: GameContext, fx: Fx) {
  s.revealConfirmed = [];
  setPhase(s, ctx, fx, "reveal", MAFIA_FIXED_MS.reveal);
}

export function maybeFinishReveal(s: MafiaState, ctx: GameContext, fx: Fx) {
  if (s.phase !== "reveal") return;
  if (everyoneOnline(s, (id) => s.revealConfirmed.includes(id))) enterNight(s, ctx, fx);
}

// ---------------------------------------------------------------- night

export function enterNight(s: MafiaState, ctx: GameContext, fx: Fx) {
  s.day += 1;
  s.picks = {};
  s.lastNight = null;
  s.voting = null;
  s.pendingRevote = null;
  setPhase(s, ctx, fx, "night", s.settings.nightSeconds * 1000);
}

/** Everyone picks at night (villagers mark a suspect), so the night ends once all online players have. */
export function maybeFinishNight(s: MafiaState, ctx: GameContext, fx: Fx) {
  if (s.phase !== "night") return;
  if (everyoneOnline(s, (id) => s.picks[id] !== undefined)) resolveNight(s, ctx, fx);
}

/**
 * Resolves all night actions at once. The Mafia's target is the plurality of
 * living Mafia picks; a split vote goes to a random pick among the leaders.
 * A protected target survives. The Investigator learns the checked player's team.
 */
export function resolveNight(s: MafiaState, ctx: GameContext, fx: Fx) {
  const night = s.day;
  const pickOf = (role: string) => {
    const id = activePlayers(s).find((x) => s.roles[x] === role);
    const pick = id ? s.picks[id] : undefined;
    return { id, pick: pick !== undefined && isActive(s, pick) ? pick : null };
  };

  const mafiaBallots = Object.fromEntries(activeMafia(s).flatMap((id) => (s.picks[id] ? [[id, s.picks[id]!]] : [])));
  const targets = activeTown(s);
  const tallies = tally(s, mafiaBallots, targets);
  const top = tallies[0]?.count ?? 0;
  const leaders = tallies.filter((t) => t.count === top).map((t) => t.targetId);
  const targetId = top > 0 ? leaders[ctx.random.int(leaders.length)]! : null;

  const doctor = pickOf("doctor");
  const protectedId = doctor.pick;
  if (doctor.id && protectedId) {
    s.saves.push({ night, targetId: protectedId, stoppedAttack: protectedId === targetId });
  }

  const investigator = pickOf("investigator");
  const checkedId = investigator.pick;
  if (investigator.id && checkedId) {
    s.checks.push({ night, targetId: checkedId, team: teamOf(s.roles[checkedId]!) });
  }

  const killedId = targetId && targetId !== protectedId ? targetId : null;
  if (killedId) s.alive[killedId] = false;

  s.nights.push({ night, targetId, protectedId, checkedId, killedId });
  s.lastNight = { night, killedId };
  s.picks = {};
  setPhase(s, ctx, fx, "morning", MAFIA_FIXED_MS.morning);
}

export function afterMorning(s: MafiaState, ctx: GameContext, fx: Fx) {
  if (checkVictory(s, fx)) return;
  enterDiscussion(s, ctx, fx);
}

// ---------------------------------------------------------------- day

export function enterDiscussion(s: MafiaState, ctx: GameContext, fx: Fx) {
  s.discussionReady = [];
  setPhase(s, ctx, fx, "discussion", s.settings.discussionSeconds * 1000);
}

export function maybeFinishDiscussion(s: MafiaState, ctx: GameContext, fx: Fx) {
  if (s.phase !== "discussion") return;
  if (everyoneOnline(s, (id) => s.discussionReady.includes(id))) enterVoting(s, ctx, fx, activePlayers(s), false);
}

export function enterVoting(s: MafiaState, ctx: GameContext, fx: Fx, candidates: string[], isRevote: boolean) {
  s.pendingRevote = null;
  s.voting = { isRevote, candidates: [...candidates], ballots: {} };
  setPhase(s, ctx, fx, "voting", s.settings.voteSeconds * 1000);
}

export function maybeCloseVoting(s: MafiaState, ctx: GameContext, fx: Fx) {
  if (s.phase !== "voting" || !s.voting) return;
  const ballots = s.voting.ballots;
  if (everyoneOnline(s, (id) => ballots[id] !== undefined)) closeVoting(s, ctx, fx);
}

/**
 * Plurality of cast ballots. A unique leader is eliminated. A tie triggers one
 * revote among the tied players; a tied revote, or no votes at all, eliminates
 * nobody. Array order never decides an outcome.
 */
export function closeVoting(s: MafiaState, ctx: GameContext, fx: Fx) {
  const voting = s.voting!;
  for (const [voterId, targetId] of Object.entries(voting.ballots)) {
    if (voting.candidates.includes(targetId)) s.ballotLog.push({ day: s.day, isRevote: voting.isRevote, voterId, targetId });
  }
  const tallies = tally(s, voting.ballots, voting.candidates);
  const max = tallies[0]?.count ?? 0;
  const leaders = tallies.filter((t) => t.count === max).map((t) => t.targetId);

  let outcome: "eliminated" | "tie" | "none" = "none";
  let eliminatedId: string | null = null;
  if (max > 0 && leaders.length === 1) {
    outcome = "eliminated";
    eliminatedId = leaders[0]!;
    s.alive[eliminatedId] = false;
  } else if (max > 0 && !voting.isRevote) {
    outcome = "tie";
    s.pendingRevote = leaders;
  }
  s.voteHistory.push({ day: s.day, isRevote: voting.isRevote, tallies, outcome, eliminatedId });
  s.voting = null;
  setPhase(s, ctx, fx, "voteResult", MAFIA_FIXED_MS.voteResult);
}

export function afterVoteResult(s: MafiaState, ctx: GameContext, fx: Fx) {
  const last = s.voteHistory[s.voteHistory.length - 1];
  if (last?.outcome === "tie" && s.pendingRevote) {
    const candidates = s.pendingRevote.filter((id) => isActive(s, id));
    if (candidates.length >= 2) return enterVoting(s, ctx, fx, candidates, true);
  }
  if (checkVictory(s, fx)) return;
  if (s.day >= MAX_DAYS) return finish(s, fx, "mafia", "day_limit");
  enterNight(s, ctx, fx);
}

// ---------------------------------------------------------------- chat

export function appendChat(s: MafiaState, ctx: GameContext, channel: ChatChannel, playerId: string, text: string) {
  const list = s.chat[channel];
  list.push({ id: s.nextChatId++, channel, playerId, text, day: s.day, at: ctx.now });
  if (list.length > CHAT_HISTORY_LIMIT) list.splice(0, list.length - CHAT_HISTORY_LIMIT);
}

// ---------------------------------------------------------------- end

/** Ends the match if a team has won. Returns true if it did. */
export function checkVictory(s: MafiaState, fx: Fx): boolean {
  const mafia = activeMafia(s).length;
  if (mafia === 0) {
    finish(s, fx, "town", "mafia_eliminated");
    return true;
  }
  if (mafia >= activeTown(s).length) {
    finish(s, fx, "mafia", "mafia_parity");
    return true;
  }
  return false;
}

export function finish(s: MafiaState, fx: Fx, winner: MafiaTeam, reason: MafiaResultsReveal["reason"]) {
  s.phase = "results";
  s.phaseEndsAt = null;
  s.phaseMs = null;
  s.voting = null;
  s.picks = {};
  s.result = { winner, reason };
  fx.push({ kind: "clearTimer", key: PHASE_TIMER }, { kind: "complete" });
}

/** Re-evaluates whatever the current phase is waiting on (after presence changes). */
export function recheckWaits(s: MafiaState, ctx: GameContext, fx: Fx) {
  switch (s.phase) {
    case "reveal":
      return maybeFinishReveal(s, ctx, fx);
    case "night":
      return maybeFinishNight(s, ctx, fx);
    case "discussion":
      return maybeFinishDiscussion(s, ctx, fx);
    case "voting":
      return maybeCloseVoting(s, ctx, fx);
    default:
      return;
  }
}
