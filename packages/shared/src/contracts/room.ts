import type { GameResults, ScoreboardEntry } from "../game-types";

export type Presence = "online" | "away";
export type RoomStatus = "lobby" | "in-game";

export interface PlayerPublic {
  id: string;
  nickname: string;
  avatarId: string;
  ready: boolean;
  presence: Presence;
  joinedAt: number;
}

export interface RoomSettings {
  capacity: number;
  requireAllReady: boolean;
}

export interface MatchSummary {
  matchId: string;
  gameId: string;
  /** Player ids dealt into the match. Others in the room are spectators. */
  participantIds: string[];
  completed: boolean;
  results: GameResults | null;
}

/**
 * Room state shared with every member. Contains nothing private, so a single
 * serialized snapshot is broadcast whenever it changes.
 */
export interface RoomSnapshot {
  code: string;
  hostId: string;
  status: RoomStatus;
  settings: RoomSettings;
  players: PlayerPublic[];
  selectedGameId: string | null;
  /** Settings of the selected game (validated by its module). */
  gameSettings: unknown;
  /** Why the host can't start right now, or null if they can. */
  startBlocker: string | null;
  match: MatchSummary | null;
  scoreboard: ScoreboardEntry[];
}
