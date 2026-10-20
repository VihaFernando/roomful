import type { Server } from "bun";
import { PROTOCOL_VERSION, type ServerMessage, type SessionGrant } from "@party/shared";
import { createApp } from "../apps/server/src/app";
import { testConfig, type Config } from "../apps/server/src/config/env";
import { silentLogger } from "../apps/server/src/infrastructure/logger";
import { createFakeTime } from "../apps/server/src/infrastructure/time";
import type { SocketData } from "../apps/server/src/websocket/gateway";

/** Boots a real Bun server on a random port with a controllable clock. */
export function startServer(config: Partial<Config> = {}) {
  const time = createFakeTime(Date.now());
  const app = createApp(testConfig(config), { clock: time.clock, scheduler: time.scheduler, logger: silentLogger });
  const server: Server<SocketData> = Bun.serve<SocketData>({ port: 0, hostname: "127.0.0.1", fetch: app.fetch, websocket: app.websocket });
  const base = `http://127.0.0.1:${server.port}`;
  return {
    app,
    time,
    base,
    wsUrl: `ws://127.0.0.1:${server.port}/ws`,
    stop: () => server.stop(true),
    async post<T>(path: string, body: unknown): Promise<{ status: number; body: T }> {
      const res = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { status: res.status, body: (await res.json()) as T };
    },
    async get<T>(path: string): Promise<{ status: number; body: T }> {
      const res = await fetch(base + path);
      return { status: res.status, body: (await res.json()) as T };
    },
  };
}

export type TestServer = ReturnType<typeof startServer>;

/** Minimal protocol client: records every frame, correlates replies by requestId. */
export class TestClient {
  readonly frames: string[] = [];
  readonly messages: ServerMessage[] = [];
  private waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
  private nextId = 1;
  closed: { code: number } | null = null;

  private constructor(readonly ws: WebSocket) {
    ws.addEventListener("message", (e) => {
      const data = String(e.data);
      this.frames.push(data);
      const msg = JSON.parse(data) as ServerMessage;
      this.messages.push(msg);
      this.waiters = this.waiters.filter((w) => {
        if (!w.pred(msg)) return true;
        w.resolve(msg);
        return false;
      });
    });
    ws.addEventListener("close", (e) => (this.closed = { code: e.code }));
  }

  static async open(url: string): Promise<TestClient> {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", () => reject(new Error("ws error")), { once: true });
    });
    return new TestClient(ws);
  }

  static async connect(s: TestServer, grant: SessionGrant): Promise<TestClient> {
    const c = await TestClient.open(s.wsUrl);
    const reply = await c.request("session.resume", { token: grant.token });
    if (reply.type !== "session.resumed") throw new Error(`resume failed: ${JSON.stringify(reply)}`);
    return c;
  }

  sendRaw(data: string) {
    this.ws.send(data);
  }

  request(type: string, payload: unknown = {}): Promise<ServerMessage> {
    const requestId = `r${this.nextId++}`;
    const p = this.waitFor((m) => m.replyTo === requestId);
    this.ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type, requestId, payload }));
    return p;
  }

  /** Sends and asserts an ack. */
  async ok(type: string, payload: unknown = {}) {
    const reply = await this.request(type, payload);
    if (reply.type !== "ack") throw new Error(`${type} failed: ${JSON.stringify(reply.payload)}`);
  }

  waitFor(pred: (m: ServerMessage) => boolean, timeoutMs = 2000): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for message")), timeoutMs);
      this.waiters.push({
        pred,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  }

  /** Latest game view received, if any. */
  get view() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i]!;
      if (m.type === "game.view") return m.payload;
      if (m.type === "session.resumed" && m.payload.game) return m.payload.game;
    }
    return null;
  }

  close() {
    this.ws.close();
  }
}

export const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
