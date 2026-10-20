import { createContext, useContext, useSyncExternalStore } from "react";
import type { PlayerPublic } from "@party/shared";
import type { RoomConnection, RoomState } from "../../services/room-connection";

export const RoomContext = createContext<RoomConnection | null>(null);

/** Room-level UI actions that game screens may trigger (sheets live in the room shell). */
export const RoomUIContext = createContext<{ openScores: () => void; openRules: () => void }>({
  openScores: () => {},
  openRules: () => {},
});

export function useConnection(): RoomConnection {
  const conn = useContext(RoomContext);
  if (!conn) throw new Error("useConnection outside RoomContext");
  return conn;
}

export function useRoomState(): RoomState {
  const conn = useConnection();
  return useSyncExternalStore(conn.subscribe, conn.getState);
}

/** Lookup helpers for rendering players by id. */
export function usePlayers() {
  const { room, playerId } = useRoomState();
  const players = room?.players ?? [];
  const byId = new Map(players.map((p) => [p.id, p]));
  const scoreNames = new Map((room?.scoreboard ?? []).map((e) => [e.playerId, e]));
  return {
    me: playerId,
    isHost: !!room && room.hostId === playerId,
    hostId: room?.hostId ?? null,
    players,
    get(id: string): PlayerPublic | { id: string; nickname: string; avatarId: string; presence: "gone" } {
      const p = byId.get(id);
      if (p) return p;
      // Players who left mid-game still render with their last known name.
      const s = scoreNames.get(id);
      return { id, nickname: s?.nickname ?? "Player who left", avatarId: s?.avatarId ?? "fox", presence: "gone" };
    },
  };
}
