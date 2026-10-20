import type { RoomSettings } from "@party/shared";
import type { TaskHandle } from "../../infrastructure/time";
import type { MatchRunner } from "../../game-engine/match-runner";
import type { Player } from "../players/player";
import { ScoreLedger } from "../scoring/score-ledger";

export interface Room {
  code: string;
  createdAt: number;
  lastActivityAt: number;
  hostId: string;
  /** Insertion order = join order (used for host succession). */
  players: Map<string, Player>;
  settings: RoomSettings;
  selectedGameId: string | null;
  gameSettings: Map<string, unknown>;
  /** Per-game data carried between matches (e.g. recently used words). */
  carryOver: Map<string, unknown>;
  match: MatchRunner | null;
  scores: ScoreLedger;
  /** When the last online player went away; null while anyone is online. */
  emptySince: number | null;
  hostTask?: TaskHandle;
  lastSnapshotJson?: string;
}

export function createRoom(code: string, hostId: string, now: number, capacity: number): Room {
  return {
    code,
    createdAt: now,
    lastActivityAt: now,
    hostId,
    players: new Map(),
    settings: { capacity, requireAllReady: false },
    selectedGameId: null,
    gameSettings: new Map(),
    carryOver: new Map(),
    match: null,
    scores: new ScoreLedger(),
    emptySince: null,
  };
}

/** Storage boundary for rooms. A shared store would also need room ownership per instance. */
export interface RoomStore {
  get(code: string): Room | undefined;
  has(code: string): boolean;
  set(room: Room): void;
  delete(code: string): void;
  values(): IterableIterator<Room>;
  readonly size: number;
}

export class InMemoryRoomStore implements RoomStore {
  private rooms = new Map<string, Room>();
  get(code: string) {
    return this.rooms.get(code);
  }
  has(code: string) {
    return this.rooms.has(code);
  }
  set(room: Room) {
    this.rooms.set(room.code, room);
  }
  delete(code: string) {
    this.rooms.delete(code);
  }
  values() {
    return this.rooms.values();
  }
  get size() {
    return this.rooms.size;
  }
}
