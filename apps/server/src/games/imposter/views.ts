import {
  categoryLabel,
  type ImposterActionType,
  type ImposterPrivateView,
  type ImposterPublicView,
} from "@party/shared/games/imposter";
import { currentTurnId, isActive, type ImposterState } from "./state";

/**
 * Built field by field from state. Never spread state here: anything not
 * explicitly listed stays on the server.
 */
export function publicView(s: ImposterState): ImposterPublicView {
  const st = s.settings;
  return {
    phase: s.phase,
    cycle: s.cycle,
    clueRound: s.clueRound,
    settings: {
      imposterCount: st.imposterCount,
      victoryMode: st.victoryMode,
      imposterGuess: st.imposterGuess,
      showClueAvatars: st.showClueAvatars,
      clueRoundsPerCycle: st.clueRoundsPerCycle,
      revealCategory: st.revealCategory,
    },
    participants: s.seats.map((id) => ({ id, alive: isActive(s, id) })),
    category: st.revealCategory ? categoryLabel(s.category) : null,
    revealConfirmed: [...s.revealConfirmed],
    turnOrder: [...s.turnOrder],
    currentTurnId: currentTurnId(s),
    clues: s.clues.map((c) => ({ ...c })),
    discussionReady: [...s.discussionReady],
    voting: s.voting
      ? {
          isRevote: s.voting.isRevote,
          candidates: [...s.voting.candidates],
          // Who has voted — never for whom.
          votedIds: Object.keys(s.voting.ballots),
        }
      : null,
    voteHistory: s.voteHistory.map((v) => ({ ...v, tallies: v.tallies.map((t) => ({ ...t })) })),
    lastElimination: s.lastElimination ? { ...s.lastElimination } : null,
    guess: s.guess
      ? {
          guesserIds: [...s.guess.guesserIds],
          submittedIds: Object.keys(s.guess.submissions),
          // closeGuess appends one result per guesser, so this round's are the last N.
          results: s.guess.closed ? s.guessResults.slice(-s.guess.guesserIds.length).map((r) => ({ ...r })) : [],
        }
      : null,
    results:
      s.phase === "results" && s.result
        ? {
            word: s.word,
            category: categoryLabel(s.category),
            winner: s.result.winner,
            reason: s.result.reason,
            roles: s.seats.map((id) => ({ playerId: id, role: s.roles[id]! })),
            ballots: s.ballotLog.map((b) => ({ ...b })),
          }
        : null,
  };
}

/** Only `viewerId`'s own secrets. Imposters get no `word` key at all. */
export function privateView(s: ImposterState, viewerId: string): ImposterPrivateView | null {
  const role = s.roles[viewerId];
  if (!role) return null;
  const myVote = s.voting?.ballots[viewerId] ?? null;
  if (role === "crew") return { role: "crew", word: s.word, category: categoryLabel(s.category), myVote };
  return {
    role: "imposter",
    category: s.settings.revealCategory ? categoryLabel(s.category) : null,
    fellowImposters: s.seats.filter((id) => id !== viewerId && s.roles[id] === "imposter"),
    myVote,
  };
}

export function availableActions(s: ImposterState, viewerId: string): ImposterActionType[] {
  if (!s.roles[viewerId] || !isActive(s, viewerId)) return [];
  switch (s.phase) {
    case "reveal":
      return s.revealConfirmed.includes(viewerId) ? [] : ["reveal.ack"];
    case "clues":
      return currentTurnId(s) === viewerId ? ["clue.submit"] : [];
    case "discussion":
      return s.discussionReady.includes(viewerId) ? [] : ["discussion.ready"];
    case "voting":
      return ["vote.cast"];
    case "guess":
      return s.guess && !s.guess.closed && s.guess.guesserIds.includes(viewerId) && !(viewerId in s.guess.submissions)
        ? ["guess.submit"]
        : [];
    default:
      return [];
  }
}
