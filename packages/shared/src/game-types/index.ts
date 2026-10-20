export type GameCategory = "deduction" | "word" | "drawing" | "trivia" | "other";

/** Public description of a game, served from the registry. */
export interface GameMetadata {
  id: string;
  version: string;
  name: string;
  tagline: string;
  description: string;
  /** Key into the web app's game icon set. */
  icon: string;
  category: GameCategory;
  minPlayers: number;
  maxPlayers: number;
  estimatedMinutes: [number, number];
  /** Whether players who join mid-match take part immediately. */
  allowsLateJoin: boolean;
}

/**
 * Everything one recipient may see about the running game. Built per viewer
 * on the server: `private` only ever contains the recipient's own secrets.
 */
export interface GameView<Pub = unknown, Priv = unknown> {
  gameId: string;
  matchId: string;
  /** Monotonic per match; clients drop frames with a lower seq. */
  seq: number;
  phase: string;
  /** Server-clock epoch ms at which the current phase/turn times out. */
  endsAt: number | null;
  public: Pub;
  private: Priv | null;
  availableActions: string[];
}

export interface ScoreAward {
  playerId: string;
  points: number;
  reason: string;
}

export interface ScoreboardEntry {
  playerId: string;
  nickname: string;
  avatarId: string;
  points: number;
  wins: number;
  gamesPlayed: number;
  /** False once the player has left the room; kept so history stays readable. */
  present: boolean;
}

export interface GameResults {
  matchId: string;
  gameId: string;
  headline: string;
  winnerIds: string[];
  awards: ScoreAward[];
}
