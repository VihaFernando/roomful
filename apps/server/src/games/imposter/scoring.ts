import type { GameOutcome } from "@party/game-sdk";
import type { ScoreAward } from "@party/shared";
import type { ImposterState } from "./state";

/** Points table. Documented in docs/IMPOSTER_RULES.md — keep them in sync. */
export const IMPOSTER_SCORING = {
  crewWin: 2,
  /** Per vote that eliminated an Imposter, for each crew member who voted for them. */
  crewCaughtImposter: 1,
  imposterWin: 3,
  imposterCorrectGuess: 2,
} as const;

const HEADLINES: Record<NonNullable<ImposterState["result"]>["reason"], (multi: boolean) => string> = {
  imposters_caught: (m) => (m ? "The crew caught every Imposter" : "The crew caught the Imposter"),
  crew_voted_wrong: (m) => (m ? "The Imposters got away" : "The Imposter got away"),
  inconclusive: (m) => (m ? "No verdict. The Imposters slipped away" : "No verdict. The Imposter slipped away"),
  imposters_parity: () => "The Imposters took over",
  word_guessed: () => "The Imposter guessed the word",
  cycle_limit: () => "The Imposters outlasted the crew",
};

export function scoreMatch(s: ImposterState): GameOutcome {
  const result = s.result;
  const awards: ScoreAward[] = [];
  const crew = s.seats.filter((id) => s.roles[id] === "crew");
  const imposters = s.seats.filter((id) => s.roles[id] === "imposter");
  if (!result) return { headline: "Game over", winnerIds: [], awards, carryOver: { recentWords: s.recentWords } };

  const winners = result.winner === "crew" ? crew : imposters;
  for (const id of winners) {
    awards.push({
      playerId: id,
      points: result.winner === "crew" ? IMPOSTER_SCORING.crewWin : IMPOSTER_SCORING.imposterWin,
      reason: result.winner === "crew" ? "Crew win" : "Imposter win",
    });
  }

  for (const vote of s.voteHistory) {
    if (vote.outcome !== "eliminated" || !vote.eliminatedId || s.roles[vote.eliminatedId] !== "imposter") continue;
    for (const b of s.ballotLog) {
      if (b.cycle === vote.cycle && b.isRevote === vote.isRevote && b.targetId === vote.eliminatedId && s.roles[b.voterId] === "crew") {
        awards.push({ playerId: b.voterId, points: IMPOSTER_SCORING.crewCaughtImposter, reason: "Voted for an Imposter" });
      }
    }
  }

  for (const g of s.guessResults) {
    if (g.correct) awards.push({ playerId: g.playerId, points: IMPOSTER_SCORING.imposterCorrectGuess, reason: "Guessed the word" });
  }

  return {
    headline: HEADLINES[result.reason](imposters.length > 1),
    winnerIds: winners,
    awards,
    carryOver: { recentWords: s.recentWords },
  };
}
