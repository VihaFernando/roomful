import { createSeededRandom, type AnyGameModule, type Random } from "@party/game-sdk";
import type { ServerMessage } from "@party/shared";
import { testConfig, type Config } from "../config/env";
import { gameModules } from "../games";
import { silentLogger } from "../infrastructure/logger";
import { createFakeTime } from "../infrastructure/time";
import { GameRegistry } from "../modules/games/game-registry";
import { InMemoryRoomStore } from "../modules/rooms/room";
import { RoomService, type Outbox } from "../modules/rooms/room-service";
import { InMemorySessionStore, SessionService } from "../modules/sessions/session-service";

/** Captures everything the RoomService would send to sockets. */
export class RecordingOutbox implements Outbox {
  readonly inbox = new Map<string, ServerMessage[]>();
  readonly disconnects: { playerId: string; code: number }[] = [];

  send(playerId: string, data: string) {
    const list = this.inbox.get(playerId) ?? [];
    list.push(JSON.parse(data));
    this.inbox.set(playerId, list);
  }
  disconnect(playerId: string, code: number) {
    this.disconnects.push({ playerId, code });
  }
  of(playerId: string) {
    return this.inbox.get(playerId) ?? [];
  }
  last<T extends ServerMessage["type"]>(playerId: string, type: T) {
    const list = this.of(playerId).filter((m) => m.type === type);
    return list[list.length - 1] as Extract<ServerMessage, { type: T }> | undefined;
  }
  /** Every serialized frame a player received (for secret-leak scans). */
  raw(playerId: string) {
    return this.of(playerId).map((m) => JSON.stringify(m));
  }
  clear() {
    this.inbox.clear();
  }
}

export function createHarness(
  opts: { config?: Partial<Config>; seed?: number; random?: Random; games?: AnyGameModule[] } = {},
) {
  const config = testConfig(opts.config);
  const time = createFakeTime();
  const random = opts.random ?? createSeededRandom(opts.seed ?? 42);
  const outbox = new RecordingOutbox();
  const sessions = new SessionService(new InMemorySessionStore(), time.clock);
  const store = new InMemoryRoomStore();
  const rooms = new RoomService({
    config,
    store,
    sessions,
    registry: new GameRegistry(opts.games ?? gameModules),
    clock: time.clock,
    scheduler: time.scheduler,
    random,
    logger: silentLogger,
    outbox,
  });

  /** Creates a room and connects `n` players (host first). */
  function room(n: number) {
    const host = rooms.createRoom({ nickname: "Host", avatarId: "fox" });
    const grants = [host];
    for (let i = 1; i < n; i++) grants.push(rooms.joinRoom(host.code, { nickname: `P${i}`, avatarId: "owl" }));
    for (const g of grants) rooms.connected(g.code, g.playerId, () => {});
    return { code: host.code, hostId: host.playerId, ids: grants.map((g) => g.playerId), grants };
  }

  return { config, time, random, outbox, sessions, store, rooms, room };
}
