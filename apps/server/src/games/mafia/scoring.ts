import type { GameOutcome } from "@party/game-sdk";
import type { ScoreAward } from "@party/shared";
import type { MafiaState } from "./state";

/** Points table. Documented in docs/MAFIA_RULES.md — keep them in sync. */
export const MAFIA_SCORING = {
  townWin: 2,
  mafiaWin: 3,
  /** Winning-team members still alive at the end. */
  survived: 1,
  /** Doctor, per night their patient was the Mafia's target. */
  doctorSave: 1,
  /** Investigator, per check that found a Mafia member. */
  foundMafia: 1,
  /** Town members, per day vote that eliminated a Mafia member they voted for. */
  votedOutMafia: 1,
} as const;

const HEADLINES: Record<NonNullable<MafiaState["result"]>["reason"], string> = {
  mafia_eliminated: "The town rooted out the Mafia",
  mafia_parity: "The Mafia took over the town",
  day_limit: "The Mafia outlasted the town",
};

export function scoreMatch(s: MafiaState): GameOutcome {
  const result = s.result;
  const awards: ScoreAward[] = [];
  if (!result) return { headline: "Game over", winnerIds: [], awards };

  const winners = s.seats.filter((id) => (s.roles[id] === "mafia") === (result.winner === "mafia"));
  for (const id of winners) {
    awards.push(
      result.winner === "town"
        ? { playerId: id, points: MAFIA_SCORING.townWin, reason: "Town win" }
        : { playerId: id, points: MAFIA_SCORING.mafiaWin, reason: "Mafia win" },
    );
    if (s.alive[id] && !s.left[id]) awards.push({ playerId: id, points: MAFIA_SCORING.survived, reason: "Survived" });
  }

  const doctorId = s.seats.find((id) => s.roles[id] === "doctor");
  if (doctorId) {
    for (const save of s.saves) {
      if (save.stoppedAttack) awards.push({ playerId: doctorId, points: MAFIA_SCORING.doctorSave, reason: "Saved a life" });
    }
  }

  const investigatorId = s.seats.find((id) => s.roles[id] === "investigator");
  if (investigatorId) {
    const found = new Set(s.checks.filter((c) => c.team === "mafia").map((c) => c.targetId));
    for (const _ of found) awards.push({ playerId: investigatorId, points: MAFIA_SCORING.foundMafia, reason: "Found the Mafia" });
  }

  for (const vote of s.voteHistory) {
    if (vote.outcome !== "eliminated" || !vote.eliminatedId || s.roles[vote.eliminatedId] !== "mafia") continue;
    for (const b of s.ballotLog) {
      if (b.day === vote.day && b.isRevote === vote.isRevote && b.targetId === vote.eliminatedId && s.roles[b.voterId] !== "mafia") {
        awards.push({ playerId: b.voterId, points: MAFIA_SCORING.votedOutMafia, reason: "Voted out the Mafia" });
      }
    }
  }

  return { headline: HEADLINES[result.reason], winnerIds: winners, awards };
}
