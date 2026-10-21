import type {
  ChatChannel,
  ChatMessage,
  MafiaPhase,
  MafiaResultsReveal,
  MafiaRole,
  MafiaSettings,
  MafiaTeam,
  MafiaVoteRecord,
  NightRecord,
} from "@party/shared/games/mafia";

/** Authoritative Mafia state. Never sent to clients as-is. */
export interface MafiaState {
  settings: MafiaSettings;
  phase: MafiaPhase;
  phaseEndsAt: number | null;
  phaseMs: number | null;
  /** Participant ids in (shuffled) seat order. */
  seats: string[];
  roles: Record<string, MafiaRole>;
  alive: Record<string, boolean>;
  /** Permanently left the room. */
  left: Record<string, boolean>;
  online: Record<string, boolean>;
  /** Night n is followed by day n. 0 during the reveal. */
  day: number;
  revealConfirmed: string[];
  /** Tonight's pick per player (kill vote, protect, check or suspect). */
  picks: Record<string, string>;
  nights: NightRecord[];
  lastNight: { night: number; killedId: string | null } | null;
  checks: { night: number; targetId: string; team: MafiaTeam }[];
  saves: { night: number; targetId: string; stoppedAttack: boolean }[];
  discussionReady: string[];
  voting: { isRevote: boolean; candidates: string[]; ballots: Record<string, string> } | null;
  /** Candidates for the revote after a tie (set during voteResult). */
  pendingRevote: string[] | null;
  voteHistory: MafiaVoteRecord[];
  ballotLog: MafiaResultsReveal["ballots"];
  chat: Record<ChatChannel, ChatMessage[]>;
  nextChatId: number;
  result: { winner: MafiaTeam; reason: MafiaResultsReveal["reason"] } | null;
}

export function isActive(s: MafiaState, id: string): boolean {
  return s.alive[id] === true && s.left[id] !== true;
}

export function activePlayers(s: MafiaState): string[] {
  return s.seats.filter((id) => isActive(s, id));
}

/** Active players with a live connection; used for "everyone is done" checks. */
export function onlineActive(s: MafiaState): string[] {
  return activePlayers(s).filter((id) => s.online[id] === true);
}

export function activeMafia(s: MafiaState): string[] {
  return activePlayers(s).filter((id) => s.roles[id] === "mafia");
}

export function activeTown(s: MafiaState): string[] {
  return activePlayers(s).filter((id) => s.roles[id] !== "mafia");
}

/** A dealt-in player who is out of the game but still in the room. */
export function isEliminated(s: MafiaState, id: string): boolean {
  return s.roles[id] !== undefined && s.alive[id] === false && s.left[id] !== true;
}

export function selfSavesLeft(s: MafiaState, doctorId: string): number | null {
  const rule = s.settings.doctorSelfSave;
  if (rule === "always") return null;
  if (rule === "never") return 0;
  return s.saves.some((x) => x.targetId === doctorId) ? 0 : 1;
}

/** Who the Doctor protected last night, if they're barred from repeating it tonight. */
export function blockedRepeatId(s: MafiaState): string | null {
  if (s.settings.doctorRepeat) return null;
  const last = s.saves[s.saves.length - 1];
  return last && last.night === s.day - 1 ? last.targetId : null;
}

/** Valid night picks for one player, in seat order. Empty if they can't pick. */
export function nightOptions(s: MafiaState, id: string): string[] {
  if (s.phase !== "night" || !isActive(s, id)) return [];
  const others = activePlayers(s).filter((x) => x !== id);
  switch (s.roles[id]) {
    case "mafia":
      return others.filter((x) => s.roles[x] !== "mafia");
    case "doctor": {
      const blocked = blockedRepeatId(s);
      const self = selfSavesLeft(s, id) !== 0 ? [id] : [];
      return activePlayers(s).filter((x) => x !== blocked && (x !== id || self.length > 0));
    }
    case "investigator":
    case "villager":
      return others;
    default:
      return [];
  }
}

/** Where this player's chat goes right now, or null. */
export function chatChannel(s: MafiaState, id: string): ChatChannel | null {
  const role = s.roles[id];
  if (!role || s.left[id] || s.phase === "results") return null;
  if (!s.alive[id]) return "graveyard";
  switch (s.phase) {
    case "reveal":
    case "night":
      return role === "mafia" ? "mafia" : null;
    default:
      return "town";
  }
}
