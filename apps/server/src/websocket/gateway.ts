import type { ServerWebSocket, WebSocketHandler } from "bun";
import {
  MAX_WS_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  WS_CLOSE,
  clientMessageSchema,
  type ClientMessage,
  type ErrorCode,
} from "@party/shared";
import { AppError } from "../infrastructure/errors";
import type { Logger } from "../infrastructure/logger";
import type { Clock, Scheduler, TaskHandle } from "../infrastructure/time";
import { RATE_RULES, RateLimiter } from "../middleware/rate-limit";
import { encode, type Outbox, type RoomService } from "../modules/rooms/room-service";
import type { SessionService } from "../modules/sessions/session-service";
import { generateId } from "../security/ids";

export interface SocketData {
  connId: string;
  ip: string;
  roomCode: string | null;
  playerId: string | null;
  authTask?: TaskHandle;
}

type Socket = ServerWebSocket<SocketData>;
type Authed = { roomCode: string; playerId: string };

const AUTH_TIMEOUT_MS = 5_000;
const IDEMPOTENCY_TTL_MS = 2 * 60_000;
const IDEMPOTENCY_MAX = 10_000;

/** Message types that change state and therefore get idempotent replies. */
const NON_IDEMPOTENT = new Set<ClientMessage["type"]>(["ping", "session.resume"]);

export interface GatewayDeps {
  sessions: SessionService;
  clock: Clock;
  scheduler: Scheduler;
  logger: Logger;
}

/**
 * Bridges sockets to the RoomService. Every inbound frame is size-checked,
 * rate-limited, JSON-parsed and schema-validated before any service sees it.
 */
export class Gateway implements Outbox {
  private sockets = new Map<string, Socket>();
  private connLimiter: RateLimiter;
  private actionLimiter: RateLimiter;
  private replies = new Map<string, { data: string; at: number }>();
  private rooms!: RoomService;

  constructor(private readonly d: GatewayDeps) {
    this.connLimiter = new RateLimiter(RATE_RULES.wsMessages, d.clock);
    this.actionLimiter = new RateLimiter(RATE_RULES.gameActions, d.clock);
  }

  attach(rooms: RoomService) {
    this.rooms = rooms;
  }

  get connectionCount() {
    return this.sockets.size;
  }

  // ---------------------------------------------------------------- Outbox

  send(playerId: string, data: string) {
    this.sockets.get(playerId)?.send(data);
  }

  disconnect(playerId: string, closeCode: number, reason: string) {
    const ws = this.sockets.get(playerId);
    if (!ws) return;
    this.sockets.delete(playerId);
    ws.close(closeCode, reason);
  }

  broadcastAll(data: string) {
    for (const ws of this.sockets.values()) ws.send(data);
  }

  // ---------------------------------------------------------------- Bun handlers

  readonly handler: WebSocketHandler<SocketData> = {
    maxPayloadLength: MAX_WS_MESSAGE_BYTES,
    idleTimeout: 60,
    sendPings: true,
    open: (ws) => {
      ws.data.authTask = this.d.scheduler.at(this.d.clock.now() + AUTH_TIMEOUT_MS, () => {
        if (!ws.data.playerId) ws.close(WS_CLOSE.AUTH_TIMEOUT, "auth timeout");
      });
    },
    message: (ws, raw) => this.onMessage(ws, raw),
    close: (ws) => {
      this.d.scheduler.cancel(ws.data.authTask);
      const { playerId, roomCode } = ws.data;
      if (!playerId || !roomCode || this.sockets.get(playerId) !== ws) return;
      this.sockets.delete(playerId);
      this.rooms.disconnected(roomCode, playerId);
    },
  };

  private onMessage(ws: Socket, raw: string | Buffer) {
    if (typeof raw !== "string") return this.reply(ws, "BAD_REQUEST", "Only text frames are supported.");
    if (raw.length > MAX_WS_MESSAGE_BYTES) return this.reply(ws, "BAD_REQUEST", "Message too large.");
    if (!this.connLimiter.take(ws.data.connId)) return this.reply(ws, "RATE_LIMITED", "Slow down a little.");

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return this.reply(ws, "BAD_REQUEST", "Malformed message.");
    }
    const parsed = clientMessageSchema.safeParse(json);
    if (!parsed.success) {
      const obj = (json && typeof json === "object" ? json : {}) as { v?: unknown; requestId?: unknown };
      const requestId = typeof obj.requestId === "string" && obj.requestId.length <= 64 ? obj.requestId : undefined;
      const message = obj.v !== PROTOCOL_VERSION ? "Unsupported protocol version. Refresh the page." : "Invalid message.";
      return this.reply(ws, "BAD_REQUEST", message, requestId);
    }
    const msg = parsed.data;

    if (msg.type === "ping") {
      ws.send(encode("pong", { serverTime: this.d.clock.now() }, msg.requestId));
      return;
    }
    if (msg.type === "session.resume") {
      if (ws.data.playerId) return this.reply(ws, "BAD_REQUEST", "Already connected.", msg.requestId);
      return this.resume(ws, msg.payload.token, msg.requestId);
    }
    const { playerId, roomCode } = ws.data;
    if (!playerId || !roomCode) return this.reply(ws, "UNAUTHORIZED", "Not connected to a room.", msg.requestId);
    const who: Authed = { playerId, roomCode };

    const cacheKey = msg.requestId && !NON_IDEMPOTENT.has(msg.type) ? `${playerId}:${msg.requestId}` : null;
    if (cacheKey) {
      const cached = this.replies.get(cacheKey);
      if (cached && this.d.clock.now() - cached.at < IDEMPOTENCY_TTL_MS) {
        ws.send(cached.data);
        return;
      }
    }

    let data: string;
    try {
      this.rooms.touchRoom(roomCode);
      this.dispatch(who, msg);
      data = encode("ack", {}, msg.requestId);
    } catch (err) {
      if (err instanceof AppError) {
        data = encode("error", { code: err.code, message: err.message }, msg.requestId);
      } else {
        this.d.logger.error("handler failed", { type: msg.type, room: roomCode, err });
        data = encode("error", { code: "INTERNAL", message: "Something went wrong." }, msg.requestId);
      }
    }
    if (cacheKey) this.remember(cacheKey, data);
    ws.send(data);
  }

  private dispatch({ roomCode, playerId }: Authed, msg: ClientMessage) {
    const rooms = this.rooms;
    switch (msg.type) {
      case "room.leave":
        return rooms.leave(roomCode, playerId);
      case "room.updateSettings":
        return rooms.updateRoomSettings(roomCode, playerId, msg.payload);
      case "room.setReady":
        return rooms.setReady(roomCode, playerId, msg.payload.ready);
      case "room.updateProfile":
        return rooms.updateProfile(roomCode, playerId, msg.payload);
      case "room.kick":
        return rooms.kick(roomCode, playerId, msg.payload.playerId);
      case "room.transferHost":
        return rooms.transferHost(roomCode, playerId, msg.payload.playerId);
      case "game.select":
        return rooms.selectGame(roomCode, playerId, msg.payload.gameId);
      case "game.updateSettings":
        return rooms.updateGameSettings(roomCode, playerId, msg.payload.gameId, msg.payload.settings);
      case "game.start":
        return rooms.startGame(roomCode, playerId);
      case "game.action":
        if (!this.actionLimiter.take(playerId)) throw new AppError("RATE_LIMITED", "Slow down a little.");
        return rooms.gameAction(roomCode, playerId, msg.payload.action);
      case "game.restart":
        return rooms.restartGame(roomCode, playerId);
      case "game.end":
        return rooms.endGame(roomCode, playerId);
      case "ping":
      case "session.resume":
        return;
    }
  }

  private resume(ws: Socket, token: string, requestId?: string) {
    const result = this.d.sessions.resolve(token);
    const room = "session" in result ? this.rooms.getRoom(result.session.roomCode) : undefined;
    if (!("session" in result) || !room || !room.players.has(result.session.playerId)) {
      const reason = "reason" in result ? result.reason : "room_closed";
      ws.send(encode("session.invalid", { reason }, requestId));
      ws.close(WS_CLOSE.SESSION_INVALID, "session invalid");
      return;
    }
    const { playerId, roomCode } = result.session;
    const existing = this.sockets.get(playerId);
    if (existing && existing !== ws) {
      // Newest connection wins (refresh, second tab, network switch).
      this.sockets.delete(playerId);
      existing.send(encode("session.replaced", {}));
      existing.close(WS_CLOSE.REPLACED, "replaced");
    }
    this.d.scheduler.cancel(ws.data.authTask);
    ws.data.playerId = playerId;
    ws.data.roomCode = roomCode;
    this.sockets.set(playerId, ws);
    this.rooms.connected(roomCode, playerId, (payload) => ws.send(encode("session.resumed", payload, requestId)));
  }

  private reply(ws: Socket, code: ErrorCode, message: string, requestId?: string) {
    ws.send(encode("error", { code, message }, requestId));
  }

  private remember(key: string, data: string) {
    if (this.replies.size >= IDEMPOTENCY_MAX) {
      const now = this.d.clock.now();
      for (const [k, v] of this.replies) if (now - v.at >= IDEMPOTENCY_TTL_MS) this.replies.delete(k);
      if (this.replies.size >= IDEMPOTENCY_MAX) this.replies.clear();
    }
    this.replies.set(key, { data, at: this.d.clock.now() });
  }

  static socketData(ip: string): SocketData {
    return { connId: generateId(), ip, roomCode: null, playerId: null };
  }
}
