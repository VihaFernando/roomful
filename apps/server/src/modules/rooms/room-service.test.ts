import { describe, expect, test } from "bun:test";
import { WS_CLOSE } from "@party/shared";
import { AppError } from "../../infrastructure/errors";
import { createHarness } from "../../testing/harness";

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe(code as AppError["code"]);
    return;
  }
  throw new Error(`expected AppError ${code}`);
}

describe("room creation", () => {
  test("creator becomes host and the first game is pre-selected", () => {
    const h = createHarness();
    const { code, hostId } = h.room(1);
    const snap = h.rooms.snapshot(h.store.get(code)!);
    expect(snap.hostId).toBe(hostId);
    expect(snap.selectedGameId).toBe("imposter");
    expect(snap.players).toHaveLength(1);
  });

  test("retries on code collisions and gives up cleanly", () => {
    // A "random" source that always returns 0 produces the same code every time.
    const h = createHarness({ random: { int: () => 0 } });
    const first = h.rooms.createRoom({ nickname: "A", avatarId: "fox" });
    expect(first.code).toBe("AAAAAA");
    expectCode(() => h.rooms.createRoom({ nickname: "B", avatarId: "fox" }), "INTERNAL");
    expect(h.store.size).toBe(1);
  });

  test("many rooms get distinct codes", () => {
    const h = createHarness();
    const codes = new Set(Array.from({ length: 200 }, () => h.rooms.createRoom({ nickname: "A", avatarId: "fox" }).code));
    expect(codes.size).toBe(200);
  });
});

describe("joining", () => {
  test("enforces capacity", () => {
    const h = createHarness({ config: { ROOM_CAPACITY: 3 } });
    const { code } = h.room(3);
    expectCode(() => h.rooms.joinRoom(code, { nickname: "Late", avatarId: "cat" }), "ROOM_FULL");
  });

  test("rejects duplicate nicknames case-insensitively", () => {
    const h = createHarness();
    const { code } = h.room(1);
    expectCode(() => h.rooms.joinRoom(code, { nickname: "host", avatarId: "cat" }), "NICKNAME_TAKEN");
  });

  test("unknown room is NOT_FOUND", () => {
    const h = createHarness();
    expectCode(() => h.rooms.joinRoom("ZZZZZZ", { nickname: "A", avatarId: "cat" }), "NOT_FOUND");
  });

  test("everyone online receives the updated snapshot", () => {
    const h = createHarness();
    const { code, hostId } = h.room(2);
    h.outbox.clear();
    h.rooms.joinRoom(code, { nickname: "New", avatarId: "cat" });
    expect(h.outbox.last(hostId, "room.snapshot")?.payload.players).toHaveLength(3);
  });

  test("capacity can't drop below the current player count", () => {
    const h = createHarness();
    const { code, hostId } = h.room(4);
    expectCode(() => h.rooms.updateRoomSettings(code, hostId, { capacity: 3 }), "BAD_REQUEST");
    h.rooms.updateRoomSettings(code, hostId, { capacity: 4 });
    expect(h.store.get(code)!.settings.capacity).toBe(4);
  });
});

describe("permissions", () => {
  test("only the host can run host actions", () => {
    const h = createHarness();
    const { code, ids } = h.room(3);
    const guest = ids[1]!;
    expectCode(() => h.rooms.selectGame(code, guest, "imposter"), "FORBIDDEN");
    expectCode(() => h.rooms.startGame(code, guest), "FORBIDDEN");
    expectCode(() => h.rooms.kick(code, guest, ids[2]!), "FORBIDDEN");
    expectCode(() => h.rooms.updateGameSettings(code, guest, "imposter", {}), "FORBIDDEN");
    expectCode(() => h.rooms.updateRoomSettings(code, guest, { capacity: 5 }), "FORBIDDEN");
    expectCode(() => h.rooms.endGame(code, guest), "FORBIDDEN");
  });

  test("players from another room can't act here", () => {
    const h = createHarness();
    const a = h.room(3);
    const b = h.room(3);
    expectCode(() => h.rooms.startGame(a.code, b.hostId), "FORBIDDEN");
    expectCode(() => h.rooms.gameAction(a.code, b.ids[1]!, { type: "reveal.ack" }), "FORBIDDEN");
  });

  test("settings are validated by the game module", () => {
    const h = createHarness();
    const { code, hostId } = h.room(3);
    expectCode(() => h.rooms.updateGameSettings(code, hostId, "imposter", { clueSeconds: 5 }), "BAD_REQUEST");
    expectCode(() => h.rooms.updateGameSettings(code, hostId, "imposter", { hacked: true }), "BAD_REQUEST");
    h.rooms.updateGameSettings(code, hostId, "imposter", { clueSeconds: 20 });
    expect((h.store.get(code)!.gameSettings.get("imposter") as { clueSeconds: number }).clueSeconds).toBe(20);
  });

  test("start is blocked with a clear reason", () => {
    const h = createHarness();
    const { code, hostId } = h.room(2);
    const snap = h.rooms.snapshot(h.store.get(code)!);
    expect(snap.startBlocker).toBe("Imposter needs 1 more player.");
    expectCode(() => h.rooms.startGame(code, hostId), "GAME_NOT_READY");
  });

  test("requireAllReady waits for everyone", () => {
    const h = createHarness();
    const { code, hostId, ids } = h.room(3);
    h.rooms.updateRoomSettings(code, hostId, { requireAllReady: true });
    expect(h.rooms.snapshot(h.store.get(code)!).startBlocker).toBe("Waiting for 3 players to be ready.");
    for (const id of ids) h.rooms.setReady(code, id, true);
    expect(h.rooms.snapshot(h.store.get(code)!).startBlocker).toBeNull();
  });
});

describe("leaving, kicking and host transfer", () => {
  test("host leaving hands host to the earliest-joined online player", () => {
    const h = createHarness();
    const { code, hostId, ids } = h.room(3);
    h.rooms.leave(code, hostId);
    expect(h.store.get(code)!.hostId).toBe(ids[1]!);
    expect(h.store.get(code)!.players.has(hostId)).toBe(false);
  });

  test("host disconnect transfers after the host grace period, not before", () => {
    const h = createHarness();
    const { code, hostId, ids } = h.room(3);
    h.rooms.disconnected(code, hostId);
    h.time.advance(h.config.HOST_TRANSFER_GRACE_MS - 1);
    expect(h.store.get(code)!.hostId).toBe(hostId);
    h.time.advance(1);
    expect(h.store.get(code)!.hostId).toBe(ids[1]!);
    // Original host is still seated (reconnect grace is longer).
    expect(h.store.get(code)!.players.has(hostId)).toBe(true);
  });

  test("host reconnecting in time keeps host", () => {
    const h = createHarness();
    const { code, hostId } = h.room(3);
    h.rooms.disconnected(code, hostId);
    h.time.advance(h.config.HOST_TRANSFER_GRACE_MS - 1000);
    h.rooms.connected(code, hostId, () => {});
    h.time.advance(h.config.HOST_TRANSFER_GRACE_MS);
    expect(h.store.get(code)!.hostId).toBe(hostId);
  });

  test("kick removes the player, revokes the session and closes the socket", () => {
    const h = createHarness();
    const { code, hostId, ids, grants } = h.room(3);
    h.rooms.kick(code, hostId, ids[2]!);
    expect(h.store.get(code)!.players.has(ids[2]!)).toBe(false);
    expect(h.sessions.resolve(grants[2]!.token)).toEqual({ reason: "kicked" });
    expect(h.outbox.disconnects).toContainEqual({ playerId: ids[2]!, code: WS_CLOSE.KICKED });
    expect(h.outbox.last(ids[2]!, "session.invalid")?.payload.reason).toBe("kicked");
  });

  test("host can't kick themselves", () => {
    const h = createHarness();
    const { code, hostId } = h.room(3);
    expectCode(() => h.rooms.kick(code, hostId, hostId), "BAD_REQUEST");
  });

  test("last player leaving closes the room", () => {
    const h = createHarness();
    const { code, hostId } = h.room(1);
    h.rooms.leave(code, hostId);
    expect(h.store.get(code)).toBeUndefined();
  });
});

describe("reconnection", () => {
  test("disconnect then reconnect keeps the same seat (no duplicate player)", () => {
    const h = createHarness();
    const { code, ids, grants } = h.room(3);
    h.rooms.disconnected(code, ids[1]!);
    expect(h.store.get(code)!.players.get(ids[1]!)!.presence).toBe("away");
    const resolved = h.sessions.resolve(grants[1]!.token);
    expect("session" in resolved && resolved.session.playerId).toBe(ids[1]!);
    let resumed: unknown;
    h.rooms.connected(code, ids[1]!, (p) => (resumed = p));
    expect(h.store.get(code)!.players.size).toBe(3);
    expect(h.store.get(code)!.players.get(ids[1]!)!.presence).toBe("online");
    expect(resumed).toMatchObject({ playerId: ids[1]!, room: { code } });
  });

  test("a player away past the grace period is removed", () => {
    const h = createHarness();
    const { code, ids, grants } = h.room(3);
    h.rooms.disconnected(code, ids[2]!);
    h.time.advance(h.config.PLAYER_RECONNECT_GRACE_MS);
    expect(h.store.get(code)!.players.has(ids[2]!)).toBe(false);
    expect(h.sessions.resolve(grants[2]!.token)).toEqual({ reason: "expired" });
  });

  test("repeated disconnect events are harmless", () => {
    const h = createHarness();
    const { code, ids } = h.room(3);
    h.rooms.disconnected(code, ids[1]!);
    h.rooms.disconnected(code, ids[1]!);
    h.rooms.connected(code, ids[1]!, () => {});
    h.time.advance(h.config.PLAYER_RECONNECT_GRACE_MS * 2);
    expect(h.store.get(code)!.players.has(ids[1]!)).toBe(true);
  });
});

describe("expiration", () => {
  test("rooms with nobody online are deleted after the empty TTL", () => {
    const h = createHarness({ config: { PLAYER_RECONNECT_GRACE_MS: 60 * 60_000 } });
    const { code, ids } = h.room(2);
    for (const id of ids) h.rooms.disconnected(code, id);
    h.time.advance(h.config.ROOM_EMPTY_TTL_MS - 1);
    h.rooms.sweep();
    expect(h.store.get(code)).toBeDefined();
    h.time.advance(1);
    h.rooms.sweep();
    expect(h.store.get(code)).toBeUndefined();
  });

  test("idle rooms are deleted after the idle TTL", () => {
    const h = createHarness();
    const { code } = h.room(2);
    h.time.advance(h.config.ROOM_IDLE_TTL_MS);
    h.rooms.sweep();
    expect(h.store.get(code)).toBeUndefined();
  });

  test("active rooms survive sweeps", () => {
    const h = createHarness();
    const { code, hostId } = h.room(2);
    for (let i = 0; i < 10; i++) {
      h.time.advance(h.config.ROOM_IDLE_TTL_MS / 2);
      h.rooms.touchRoom(code);
      h.rooms.setReady(code, hostId, i % 2 === 0);
      h.rooms.sweep();
    }
    expect(h.store.get(code)).toBeDefined();
  });
});

describe("scoreboard", () => {
  test("persists across matches and survives return to lobby", () => {
    const h = createHarness();
    const { code, hostId } = h.room(4);
    h.rooms.startGame(code, hostId);
    h.rooms.endGame(code, hostId); // aborted: no scores
    const room = h.store.get(code)!;
    expect(room.scores.standings().every((e) => e.points === 0 && e.gamesPlayed === 0)).toBe(true);
    expect(room.match).toBeNull();
  });
});
