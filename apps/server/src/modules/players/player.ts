import type { PlayerPublic } from "@party/shared";
import type { TaskHandle } from "../../infrastructure/time";

/** Server-side player seat. Game-agnostic: no roles, scores or game fields. */
export interface Player {
  id: string;
  nickname: string;
  avatarId: string;
  ready: boolean;
  presence: "online" | "away";
  joinedAt: number;
  awaySince: number | null;
  /** Removes the player when the reconnect grace period runs out. */
  graceTask?: TaskHandle;
}

export function toPublicPlayer(p: Player): PlayerPublic {
  return {
    id: p.id,
    nickname: p.nickname,
    avatarId: p.avatarId,
    ready: p.ready,
    presence: p.presence,
    joinedAt: p.joinedAt,
  };
}

export function sameNickname(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;
}
