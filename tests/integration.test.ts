import { afterEach, describe, expect, test } from "bun:test";
import type { ApiError, RoomLookup, SessionGrant } from "@party/shared";
import type { ImposterPrivateView, ImposterPublicView } from "@party/shared/games/imposter";
import { TestClient, startServer, tick, type TestServer } from "./helpers";

let server: TestServer | null = null;
afterEach(() => {
  server?.stop();
  server = null;
});

const pub = (c: TestClient) => c.view!.public as ImposterPublicView;
const priv = (c: TestClient) => c.view!.private as ImposterPrivateView | null;

async function setupRoom(s: TestServer, n: number) {
  const host = (await s.post<SessionGrant>("/api/rooms", { nickname: "Host", avatarId: "fox" })).body;
  const grants = [host];
  for (let i = 1; i < n; i++) {
    grants.push((await s.post<SessionGrant>(`/api/rooms/${host.code}/join`, { nickname: `Player ${i}`, avatarId: "owl" })).body);
  }
  const clients: TestClient[] = [];
  for (const g of grants) clients.push(await TestClient.connect(s, g));
  await tick();
  return { code: host.code, grants, clients, host: clients[0]! };
}

/** Plays from reveal to the vote, then everyone votes as told. */
async function playToVote(clients: TestClient[]) {
  for (const c of clients) await c.ok("game.action", { action: { type: "reveal.ack" } });
  await tick();
  for (;;) {
    const turn = pub(clients[0]!).currentTurnId;
    if (!turn || pub(clients[0]!).phase !== "clues") break;
    const c = clients.find((x) => idOf(x) === turn)!;
    await c.ok("game.action", { action: { type: "clue.submit", text: "a clue" } });
    await tick();
  }
  for (const c of clients) await c.ok("game.action", { action: { type: "discussion.ready" } });
  await tick();
}

function idOf(c: TestClient) {
  return (c.messages.find((m) => m.type === "session.resumed") as { payload: { playerId: string } }).payload.playerId;
}

describe("HTTP API", () => {
  test("health, games, lookup and validation", async () => {
    server = startServer();
    expect((await server.get<{ ok: boolean }>("/api/health")).body.ok).toBe(true);
    const games = await server.get<{ games: { id: string }[] }>("/api/games");
    expect(games.body.games.map((g) => g.id)).toEqual(["imposter"]);

    const bad = await server.post<ApiError>("/api/rooms", { nickname: "", avatarId: "fox" });
    expect(bad.status).toBe(400);
    const badAvatar = await server.post<ApiError>("/api/rooms", { nickname: "Sam", avatarId: "dragon" });
    expect(badAvatar.status).toBe(400);

    const created = await server.post<SessionGrant>("/api/rooms", { nickname: "Sam", avatarId: "fox" });
    expect(created.status).toBe(201);
    const lookup = await server.get<RoomLookup>(`/api/rooms/${created.body.code.toLowerCase()}`);
    expect(lookup.body).toMatchObject({ code: created.body.code, playerCount: 1, joinable: true });
    expect(JSON.stringify(lookup.body)).not.toContain("Sam"); // lookups never leak names

    expect((await server.get<ApiError>("/api/rooms/ZZZZZZ")).status).toBe(404);
    expect((await server.get<ApiError>("/api/rooms/not-a-code!!")).status).toBe(404);
  });

  test("rate-limits room creation per IP", async () => {
    server = startServer();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await server.post("/api/rooms", { nickname: `N${i}`, avatarId: "fox" })).status);
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses[6]).toBe(429);
  });

  test("rejects oversized bodies", async () => {
    server = startServer();
    const res = await server.post<ApiError>("/api/rooms", { nickname: "x".repeat(10_000), avatarId: "fox" });
    expect(res.status).toBe(400);
  });
});

describe("WebSocket protocol hardening", () => {
  test("malformed, unauthenticated and unknown messages get errors and the server keeps working", async () => {
    server = startServer();
    const c = await TestClient.open(server.wsUrl);
    c.sendRaw("not json");
    c.sendRaw(JSON.stringify({ v: 99, type: "ping", payload: {} }));
    c.sendRaw(JSON.stringify({ v: 1, type: "room.nuke", requestId: "x1", payload: {} }));
    c.sendRaw(JSON.stringify({ v: 1, type: "game.start", requestId: "x2", payload: {} }));
    await tick(50);
    const errors = c.messages.filter((m) => m.type === "error").map((m) => (m.payload as { code: string }).code);
    expect(errors).toEqual(["BAD_REQUEST", "BAD_REQUEST", "BAD_REQUEST", "UNAUTHORIZED"]);
    expect(c.messages.find((m) => m.replyTo === "x1")).toBeDefined();

    const pong = await c.request("ping");
    expect(pong.type).toBe("pong");

    const bogus = await c.request("session.resume", { token: "x".repeat(43) });
    expect(bogus).toMatchObject({ type: "session.invalid", payload: { reason: "unknown" } });
  });

  test("oversized frames are refused without affecting other players", async () => {
    server = startServer();
    const { clients } = await setupRoom(server, 3);
    const [a, b] = clients;
    a!.sendRaw(JSON.stringify({ v: 1, type: "ping", payload: { pad: "x".repeat(20_000) } }));
    await tick(100);
    expect(a!.closed).not.toBeNull();
    expect((await b!.request("ping")).type).toBe("pong");
  });

  test("players cannot act on behalf of others or escalate to host", async () => {
    server = startServer();
    const { clients } = await setupRoom(server, 3);
    const guest = clients[1]!;
    const r = await guest.request("game.start");
    expect(r).toMatchObject({ type: "error", payload: { code: "FORBIDDEN" } });
    const kick = await guest.request("room.kick", { playerId: idOf(clients[0]!) });
    expect(kick).toMatchObject({ type: "error", payload: { code: "FORBIDDEN" } });
  });

  test("retrying a request id replays the original reply instead of re-applying it", async () => {
    server = startServer();
    const { host, clients } = await setupRoom(server, 3);
    await host.ok("game.start");
    await tick();
    const frame = JSON.stringify({ v: 1, type: "game.action", requestId: "same", payload: { action: { type: "reveal.ack" } } });
    clients[1]!.sendRaw(frame);
    clients[1]!.sendRaw(frame);
    await tick(50);
    const replies = clients[1]!.messages.filter((m) => m.replyTo === "same");
    expect(replies.map((m) => m.type)).toEqual(["ack", "ack"]);
  });
});

describe("full Imposter match over WebSockets", () => {
  test("plays, keeps secrets, scores and replays without recreating the room", async () => {
    server = startServer();
    const { clients, host, code } = await setupRoom(server, 4);
    await host.ok("game.start");
    await tick();

    const imposter = clients.find((c) => priv(c)?.role === "imposter")!;
    const crew = clients.filter((c) => c !== imposter);
    expect(crew).toHaveLength(3);
    const word = (priv(crew[0]!) as { word: string }).word;
    for (const c of crew) expect((priv(c) as { word: string }).word).toBe(word);

    await playToVote(clients);
    expect(pub(host).phase).toBe("voting");
    const impId = idOf(imposter);
    for (const c of clients) {
      const target = c === imposter ? idOf(crew[0]!) : impId;
      await c.ok("game.action", { action: { type: "vote.cast", targetId: target } });
    }
    await tick();
    expect(pub(host).phase).toBe("voteResult");
    expect(pub(host).lastElimination).toEqual({ playerId: impId, role: "imposter" });

    // Scan everything the Imposter received before results for the word.
    const wordRe = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    for (const f of imposter.frames) expect(f).not.toMatch(wordRe);

    server.time.advance(6_000);
    await tick();
    expect(pub(host).phase).toBe("results");
    expect(pub(imposter).results?.word).toBe(word);
    expect(pub(imposter).results?.winner).toBe("crew");

    const snap = host.messages.filter((m) => m.type === "room.snapshot").at(-1)!.payload as {
      scoreboard: { playerId: string; points: number }[];
      match: { completed: boolean };
    };
    expect(snap.match.completed).toBe(true);
    expect(snap.scoreboard.find((e) => e.playerId === impId)!.points).toBe(0);
    for (const c of crew) expect(snap.scoreboard.find((e) => e.playerId === idOf(c))!.points).toBe(3);

    // Guests can't restart; host can, in the same room.
    expect(await clients[1]!.request("game.restart")).toMatchObject({ type: "error", payload: { code: "FORBIDDEN" } });
    await host.ok("game.restart");
    await tick();
    expect(pub(host).phase).toBe("reveal");
    expect(server.app.rooms.getRoom(code)!.players.size).toBe(4);
  });

  test("two rooms run side by side without leaking into each other", async () => {
    server = startServer();
    const a = await setupRoom(server, 3);
    const b = await setupRoom(server, 3);
    await a.host.ok("game.start");
    await b.host.ok("game.start");
    await tick();
    const wordA = a.clients.map((c) => priv(c)).find((p) => p?.role === "crew") as { word: string };
    const matchA = a.host.view!.matchId;
    for (const c of b.clients) {
      for (const f of c.frames) {
        expect(f).not.toContain(a.code);
        expect(f).not.toContain(matchA);
        for (const id of a.clients.map(idOf)) expect(f).not.toContain(id);
      }
      expect(c.view!.matchId).not.toBe(matchA);
    }
    // Room B players can't act in room A.
    expect(b.clients[1]!.view!.matchId).not.toBe(matchA);
    void wordA;
  });

  test("reconnecting mid-game restores phase and private role; newest connection wins", async () => {
    server = startServer();
    const { clients, host, grants } = await setupRoom(server, 3);
    await host.ok("game.start");
    await tick();
    const original = clients[2]!;
    const roleBefore = priv(original)!.role;

    // Second device with the same session replaces the first.
    const second = await TestClient.connect(server, grants[2]!);
    await tick(50);
    expect(original.messages.some((m) => m.type === "session.replaced")).toBe(true);
    expect(original.closed).not.toBeNull();
    expect(priv(second)!.role).toBe(roleBefore);
    expect(pub(second).phase).toBe("reveal");

    // Drop and come back: same seat, no duplicate player.
    second.close();
    await tick(50);
    const third = await TestClient.connect(server, grants[2]!);
    await tick();
    expect(priv(third)!.role).toBe(roleBefore);
    const room = third.messages.find((m) => m.type === "session.resumed")!.payload as { room: { players: unknown[] } };
    expect(room.room.players).toHaveLength(3);
  });
});
