import type {
  GuessReveal,
  ImposterCategoryId,
  ImposterClue,
  ImposterPhase,
  ImposterResultsReveal,
  ImposterRole,
  ImposterSettings,
  ImposterTeam,
  VoteRecord,
} from "@party/shared/games/imposter";

/** Authoritative Imposter state. Never sent to clients as-is. */
export interface ImposterState {
  settings: ImposterSettings;
  phase: ImposterPhase;
  phaseEndsAt: number | null;
  /** Participant ids in (shuffled) seat order. */
  seats: string[];
  roles: Record<string, ImposterRole>;
  alive: Record<string, boolean>;
  /** Permanently left the room. */
  left: Record<string, boolean>;
  online: Record<string, boolean>;
  word: string;
  category: ImposterCategoryId;
  cycle: number;
  clueRound: number;
  revealConfirmed: string[];
  turnOrder: string[];
  turnIndex: number;
  clues: ImposterClue[];
  discussionReady: string[];
  voting: { isRevote: boolean; candidates: string[]; ballots: Record<string, string> } | null;
  /** Candidates to revote on after a tie (set during voteResult). */
  pendingRevote: string[] | null;
  ballotLog: ImposterResultsReveal["ballots"];
  voteHistory: VoteRecord[];
  lastElimination: { playerId: string; role: ImposterRole } | null;
  guess: { guesserIds: string[]; submissions: Record<string, string | null>; closed: boolean } | null;
  guessResults: GuessReveal[];
  /** Imposters who already used their one guess (elimination mode). */
  guessedIds: string[];
  result: { winner: ImposterTeam; reason: ImposterResultsReveal["reason"] } | null;
  recentWords: string[];
}

export function isActive(s: ImposterState, id: string): boolean {
  return s.alive[id] === true && s.left[id] !== true;
}

export function activePlayers(s: ImposterState): string[] {
  return s.seats.filter((id) => isActive(s, id));
}

/** Active players with a live connection; used for "everyone is done" checks. */
export function onlineActive(s: ImposterState): string[] {
  return activePlayers(s).filter((id) => s.online[id] === true);
}

export function activeImposters(s: ImposterState): string[] {
  return activePlayers(s).filter((id) => s.roles[id] === "imposter");
}

export function activeCrew(s: ImposterState): string[] {
  return activePlayers(s).filter((id) => s.roles[id] === "crew");
}

export function currentTurnId(s: ImposterState): string | null {
  return s.phase === "clues" ? (s.turnOrder[s.turnIndex] ?? null) : null;
}
