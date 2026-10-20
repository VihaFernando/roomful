import { describe, expect, test } from "bun:test";
import { GameRegistry } from "../modules/games/game-registry";
import { imposterModule } from "../games/imposter/module";
import { coinGame } from "../testing/coin-game";
import { createHarness } from "../testing/harness";

function coinRoom(n = 3) {
  const h = createHarness({ games: [coinGame, imposterModule] });
  const r = h.room(n);
  return { h, ...r };
}

describe("game registry", () => {
  test("rejects duplicate and malformed ids; lists metadata with defaults", () => {
    const reg = new GameRegistry([coinGame]);
    expect(() => reg.register(coinGame)).toThrow(/already registered/);
    expect(() => reg.register({ ...coinGame, metadata: { ...coinGame.metadata, id: "Bad Id" } })).toThrow(/Invalid/);
    expect(reg.listings()).toEqual([{ ...coinGame.metadata, defaultSettings: { rounds: 1 } }]);
    expect(reg.get("nope")).toBeUndefined();
  });

  test("rooms list and select any registered game", () => {
    const { h, code, hostId } = coinRoom();
    expect(h.rooms.snapshot(h.store.get(code)!).selectedGameId).toBe("coin");
    h.rooms.selectGame(code, hostId, "imposter");
    expect(h.store.get(code)!.selectedGameId).toBe("imposter");
    expect(() => h.rooms.selectGame(code, hostId, "chess")).toThrow(/doesn't exist/);
  });
});

describe("match runner", () => {
  test("each player only receives their own private state", () => {
    const { h, code, hostId, ids } = coinRoom(3);
    h.rooms.startGame(code, hostId);
    const coins = (h.store.get(code)!.match as unknown as { state: { coins: Record<string, string> } }).state.coins;
    for (const id of ids) {
      const view = h.outbox.last(id, "game.view")!.payload;
      expect(view.private).toEqual({ coin: coins[id] });
    }
  });

  test("rejected actions leave state untouched and report the module's error", () => {
    const { h, code, hostId, ids } = coinRoom(3);
    h.rooms.startGame(code, hostId);
    h.rooms.gameAction(code, ids[0]!, { type: "call" });
    const before = JSON.stringify(h.rooms.viewFor(code, ids[0]!));
    expect(() => h.rooms.gameAction(code, ids[0]!, { type: "call" })).toThrow("already called");
    expect(() => h.rooms.gameAction(code, ids[0]!, { type: "nonsense" })).toThrow("isn't valid");
    expect(() => h.rooms.gameAction(code, ids[0]!, "garbage")).toThrow("isn't valid");
    expect(JSON.stringify(h.rooms.viewFor(code, ids[0]!))).toBe(before);
  });

  test("a module that throws doesn't crash the room", () => {
    const { h, code, hostId, ids } = coinRoom(3);
    h.rooms.startGame(code, hostId);
    expect(() => h.rooms.gameAction(code, ids[1]!, { type: "boom" })).toThrow("Something went wrong");
    h.rooms.gameAction(code, ids[1]!, { type: "call" });
    expect(h.rooms.viewFor(code, ids[1]!)!.public).toEqual({ called: [ids[1]] });
  });

  test("views are only re-sent to players whose view changed", () => {
    const { h, code, hostId, ids } = coinRoom(3);
    h.rooms.startGame(code, hostId);
    h.outbox.clear();
    h.rooms.setReady(code, ids[0]!, true); // room-only change
    for (const id of ids) expect(h.outbox.of(id).filter((m) => m.type === "game.view")).toHaveLength(0);
    h.rooms.gameAction(code, ids[0]!, { type: "call" });
    // Public view changed for all; caller's available actions changed too.
    for (const id of ids) expect(h.outbox.of(id).filter((m) => m.type === "game.view")).toHaveLength(1);
  });

  test("completion applies scores once via the shared ledger", () => {
    const { h, code, hostId, ids } = coinRoom(3);
    h.rooms.startGame(code, hostId);
    for (const id of ids) h.rooms.gameAction(code, id, { type: "call" });
    const room = h.store.get(code)!;
    expect(room.match!.completed).toBe(true);
    const snap = h.rooms.snapshot(room);
    expect(snap.match!.results).not.toBeNull();
    expect(snap.scoreboard.every((e) => e.gamesPlayed === 1)).toBe(true);
    const winners = snap.match!.results!.winnerIds;
    for (const e of snap.scoreboard) expect(e.points).toBe(winners.includes(e.playerId) ? 1 : 0);
    expect(() => h.rooms.gameAction(code, ids[0]!, { type: "call" })).toThrow("finished");
  });

  test("timers use the server clock", () => {
    const { h, code, hostId } = coinRoom(3);
    h.rooms.startGame(code, hostId);
    h.time.advance(9_999);
    expect(h.store.get(code)!.match!.completed).toBe(false);
    h.time.advance(1);
    expect(h.store.get(code)!.match!.completed).toBe(true);
  });

  test("restart starts a fresh match with the same room and keeps scores", () => {
    const { h, code, hostId, ids } = coinRoom(3);
    h.rooms.startGame(code, hostId);
    expect(() => h.rooms.restartGame(code, hostId)).toThrow("hasn't finished");
    h.time.advance(10_000);
    const firstMatch = h.store.get(code)!.match!.matchId;
    h.rooms.restartGame(code, hostId);
    const room = h.store.get(code)!;
    expect(room.match!.matchId).not.toBe(firstMatch);
    expect(room.players.size).toBe(3);
    expect(room.scores.standings().every((e) => e.gamesPlayed === 1)).toBe(true);
    expect(ids.every((id) => room.match!.participantIds.includes(id))).toBe(true);
  });

  test("ending mid-game aborts without scores and notifies everyone", () => {
    const { h, code, hostId, ids } = coinRoom(3);
    h.rooms.startGame(code, hostId);
    h.rooms.endGame(code, hostId);
    expect(h.store.get(code)!.match).toBeNull();
    for (const id of ids) expect(h.outbox.last(id, "game.ended")?.payload.reason).toBe("aborted");
    expect(h.store.get(code)!.scores.standings().every((e) => e.gamesPlayed === 0)).toBe(true);
  });

  test("a module-requested abort returns the room to the lobby", () => {
    const { h, code, hostId, ids } = coinRoom(3);
    h.rooms.startGame(code, hostId);
    h.rooms.leave(code, ids[2]!);
    expect(h.store.get(code)!.match).toBeNull();
    expect(h.outbox.last(ids[0]!, "game.ended")?.payload.reason).toBe("not_enough_players");
  });

  test("late joiners spectate: public view only", () => {
    const { h, code, hostId } = coinRoom(3);
    h.rooms.startGame(code, hostId);
    const late = h.rooms.joinRoom(code, { nickname: "Late", avatarId: "cat" });
    h.rooms.connected(code, late.playerId, () => {});
    const view = h.rooms.viewFor(code, late.playerId)!;
    expect(view.private).toBeNull();
    expect(view.availableActions).toEqual([]);
  });

  test("reconnect gets a full resync including private state", () => {
    const { h, code, hostId, ids } = coinRoom(3);
    h.rooms.startGame(code, hostId);
    h.rooms.disconnected(code, ids[1]!);
    let resumed: { game: { private: unknown } | null } | undefined;
    h.rooms.connected(code, ids[1]!, (p) => (resumed = p));
    expect(resumed!.game!.private).toEqual(h.rooms.viewFor(code, ids[1]!)!.private);
  });
});
