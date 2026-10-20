/**
 * Imposter phase machine. Every function mutates a *draft* (a fresh clone made
 * by the module entry points) and appends effects. See docs/IMPOSTER_RULES.md.
 */
import { normalizeForCompare, type GameContext, type GameEffect } from "@party/game-sdk";
import { MAX_CYCLES, type ImposterResultsReveal, type ImposterTeam } from "@party/shared/games/imposter";
import { RECENT_WORDS_LIMIT } from "./words";
import {
  activeCrew,
  activeImposters,
  activePlayers,
  isActive,
  onlineActive,
  type ImposterState,
} from "./state";

export const REVEAL_MS = 60_000;
export const VOTE_RESULT_MS = 6_000;
export const GUESS_MS = 30_000;
export const GUESS_RESULT_MS = 5_000;
export const PHASE_TIMER = "phase";

export type Fx = GameEffect[];

function setTimer(s: ImposterState, fx: Fx, at: number) {
  s.phaseEndsAt = at;
  fx.push({ kind: "setTimer", key: PHASE_TIMER, at });
}

/** True when at least one online active player exists and all of them satisfy `done`. */
function everyoneOnline(s: ImposterState, done: (id: string) => boolean): boolean {
  const ids = onlineActive(s);
  return ids.length > 0 && ids.every(done);
}

// ---------------------------------------------------------------- reveal

export function enterReveal(s: ImposterState, ctx: GameContext, fx: Fx) {
  s.phase = "reveal";
  s.revealConfirmed = [];
  setTimer(s, fx, ctx.now + REVEAL_MS);
}

export function maybeFinishReveal(s: ImposterState, ctx: GameContext, fx: Fx) {
  if (s.phase !== "reveal") return;
  if (everyoneOnline(s, (id) => s.revealConfirmed.includes(id))) enterClues(s, ctx, fx);
}

// ---------------------------------------------------------------- clues

/** Starts a new cycle: fresh turn order rotated to a random starting player. */
export function enterClues(s: ImposterState, ctx: GameContext, fx: Fx) {
  s.cycle += 1;
  s.clueRound = 1;
  s.lastElimination = null;
  const active = activePlayers(s);
  const start = ctx.random.int(active.length);
  s.turnOrder = [...active.slice(start), ...active.slice(0, start)];
  s.turnIndex = -1;
  advanceTurn(s, ctx, fx);
}

/** Moves to the next player who can still give a clue, or on to discussion. */
export function advanceTurn(s: ImposterState, ctx: GameContext, fx: Fx) {
  for (;;) {
    s.turnIndex += 1;
    if (s.turnIndex >= s.turnOrder.length) {
      if (s.clueRound < s.settings.clueRoundsPerCycle) {
        s.clueRound += 1;
        s.turnIndex = -1;
        continue;
      }
      enterDiscussion(s, ctx, fx);
      return;
    }
    const id = s.turnOrder[s.turnIndex]!;
    if (isActive(s, id)) break;
  }
  s.phase = "clues";
  setTimer(s, fx, ctx.now + s.settings.clueSeconds * 1000);
}

export function recordClue(s: ImposterState, playerId: string, text: string | null) {
  s.clues.push({ cycle: s.cycle, round: s.clueRound, playerId, text });
}

/** Rejects crew clues that contain the secret word (whole word, simple plurals, or squashed form). */
export function clueRevealsWord(clue: string, word: string): boolean {
  const c = ` ${normalizeForCompare(clue)} `;
  const w = normalizeForCompare(word);
  if (!w) return false;
  if ([w, `${w}s`, `${w}es`].some((form) => c.includes(` ${form} `))) return true;
  if (w.includes(" ")) return c.replace(/ /g, "").includes(w.replace(/ /g, ""));
  return false;
}

// ---------------------------------------------------------------- discussion

export function enterDiscussion(s: ImposterState, ctx: GameContext, fx: Fx) {
  s.phase = "discussion";
  s.discussionReady = [];
  setTimer(s, fx, ctx.now + s.settings.discussionSeconds * 1000);
}

export function maybeFinishDiscussion(s: ImposterState, ctx: GameContext, fx: Fx) {
  if (s.phase !== "discussion") return;
  if (everyoneOnline(s, (id) => s.discussionReady.includes(id))) enterVoting(s, ctx, fx, activePlayers(s), false);
}

// ---------------------------------------------------------------- voting

export function enterVoting(s: ImposterState, ctx: GameContext, fx: Fx, candidates: string[], isRevote: boolean) {
  s.phase = "voting";
  s.pendingRevote = null;
  s.voting = { isRevote, candidates: [...candidates], ballots: {} };
  setTimer(s, fx, ctx.now + s.settings.voteSeconds * 1000);
}

export function maybeCloseVoting(s: ImposterState, ctx: GameContext, fx: Fx) {
  if (s.phase !== "voting" || !s.voting) return;
  const ballots = s.voting.ballots;
  if (everyoneOnline(s, (id) => ballots[id] !== undefined)) closeVoting(s, ctx, fx);
}

/**
 * Plurality of cast ballots. A unique leader is eliminated. Any tie (including
 * nobody voting) triggers one revote among the tied players; a tied revote is
 * inconclusive. Array order never decides an outcome.
 */
export function closeVoting(s: ImposterState, ctx: GameContext, fx: Fx) {
  const voting = s.voting!;
  const counts = new Map<string, number>(voting.candidates.map((id) => [id, 0]));
  for (const [voterId, targetId] of Object.entries(voting.ballots)) {
    if (!counts.has(targetId)) continue;
    counts.set(targetId, counts.get(targetId)! + 1);
    s.ballotLog.push({ cycle: s.cycle, isRevote: voting.isRevote, voterId, targetId });
  }
  const tallies = [...counts.entries()]
    .map(([targetId, count]) => ({ targetId, count }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count || s.seats.indexOf(a.targetId) - s.seats.indexOf(b.targetId));
  const max = tallies[0]?.count ?? 0;
  const leaders = max > 0 ? tallies.filter((t) => t.count === max).map((t) => t.targetId) : [...voting.candidates];

  let outcome: "eliminated" | "tie" | "inconclusive";
  let eliminatedId: string | null = null;
  if (max > 0 && leaders.length === 1) {
    outcome = "eliminated";
    eliminatedId = leaders[0]!;
    s.alive[eliminatedId] = false;
    s.lastElimination = { playerId: eliminatedId, role: s.roles[eliminatedId]! };
  } else if (!voting.isRevote && leaders.length >= 2) {
    outcome = "tie";
    s.pendingRevote = leaders;
  } else {
    outcome = "inconclusive";
  }
  s.voteHistory.push({ cycle: s.cycle, isRevote: voting.isRevote, tallies, outcome, eliminatedId });
  s.voting = null;
  s.phase = "voteResult";
  setTimer(s, fx, ctx.now + VOTE_RESULT_MS);
}

/** After the vote result has been shown. */
export function afterVoteResult(s: ImposterState, ctx: GameContext, fx: Fx) {
  const last = s.voteHistory[s.voteHistory.length - 1]!;
  if (last.outcome === "tie" && s.pendingRevote) {
    const candidates = s.pendingRevote.filter((id) => isActive(s, id));
    if (candidates.length >= 2) return enterVoting(s, ctx, fx, candidates, true);
  }
  if (last.outcome === "eliminated" && last.eliminatedId && s.roles[last.eliminatedId] === "imposter") {
    if (s.settings.victoryMode === "oneVote" || activeImposters(s).length === 0) {
      return finish(s, fx, "crew", "imposters_caught");
    }
    return continueOrEnd(s, ctx, fx);
  }
  // The vote missed: a crew member went out, or nobody did.
  const guessers = activeImposters(s).filter((id) => !s.guessedIds.includes(id));
  if (s.settings.imposterGuess === "onSurvive" && guessers.length > 0) return enterGuess(s, ctx, fx, guessers);
  afterMiss(s, ctx, fx);
}

// ---------------------------------------------------------------- imposter guess

export function enterGuess(s: ImposterState, ctx: GameContext, fx: Fx, guesserIds: string[]) {
  s.phase = "guess";
  s.guess = { guesserIds, submissions: {}, closed: false };
  setTimer(s, fx, ctx.now + GUESS_MS);
}

export function isCorrectGuess(guess: string, word: string): boolean {
  const g = normalizeForCompare(guess);
  const w = normalizeForCompare(word);
  if (!g) return false;
  const squash = (x: string) => x.replace(/ /g, "").replace(/(es|s)$/, "");
  return g === w || squash(g) === squash(w) || squash(g.replace(/^(the|a|an) /, "")) === squash(w.replace(/^(the|a|an) /, ""));
}

export function maybeCloseGuess(s: ImposterState, ctx: GameContext, fx: Fx) {
  if (s.phase !== "guess" || !s.guess || s.guess.closed) return;
  const g = s.guess;
  const pending = g.guesserIds.filter((id) => isActive(s, id) && s.online[id] && !(id in g.submissions));
  if (pending.length === 0) closeGuess(s, ctx, fx);
}

export function closeGuess(s: ImposterState, ctx: GameContext, fx: Fx) {
  const g = s.guess!;
  g.closed = true;
  for (const id of g.guesserIds) {
    const text = g.submissions[id] ?? null;
    if (text !== null) s.guessedIds.push(id);
    s.guessResults.push({ playerId: id, text, correct: text !== null && isCorrectGuess(text, s.word) });
  }
  setTimer(s, fx, ctx.now + GUESS_RESULT_MS);
}

export function afterMiss(s: ImposterState, ctx: GameContext, fx: Fx) {
  const last = s.voteHistory[s.voteHistory.length - 1];
  if (s.settings.victoryMode === "oneVote") {
    return finish(s, fx, "imposters", last?.outcome === "eliminated" ? "crew_voted_wrong" : "inconclusive");
  }
  continueOrEnd(s, ctx, fx);
}

/** Elimination mode: decide whether another clue → vote cycle is played. */
function continueOrEnd(s: ImposterState, ctx: GameContext, fx: Fx) {
  if (s.guessResults.some((g) => g.correct)) return finish(s, fx, "imposters", "word_guessed");
  const imps = activeImposters(s).length;
  if (imps === 0) return finish(s, fx, "crew", "imposters_caught");
  if (imps >= activeCrew(s).length) return finish(s, fx, "imposters", "imposters_parity");
  if (s.cycle >= MAX_CYCLES) return finish(s, fx, "imposters", "cycle_limit");
  s.guess = null;
  enterClues(s, ctx, fx);
}

// ---------------------------------------------------------------- end

export function finish(s: ImposterState, fx: Fx, winner: ImposterTeam, reason: ImposterResultsReveal["reason"]) {
  s.phase = "results";
  s.phaseEndsAt = null;
  s.voting = null;
  s.result = { winner, reason };
  s.recentWords = [s.word, ...s.recentWords.filter((w) => w !== s.word)].slice(0, RECENT_WORDS_LIMIT);
  fx.push({ kind: "clearTimer", key: PHASE_TIMER }, { kind: "complete" });
}

/** Re-evaluates whatever the current phase is waiting on (after presence changes). */
export function recheckWaits(s: ImposterState, ctx: GameContext, fx: Fx) {
  switch (s.phase) {
    case "reveal":
      return maybeFinishReveal(s, ctx, fx);
    case "discussion":
      return maybeFinishDiscussion(s, ctx, fx);
    case "voting":
      return maybeCloseVoting(s, ctx, fx);
    case "guess":
      return maybeCloseGuess(s, ctx, fx);
    default:
      return;
  }
}
