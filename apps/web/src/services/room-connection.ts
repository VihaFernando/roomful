import {
  PROTOCOL_VERSION,
  WS_CLOSE,
  type ClientMessageType,
  type ClientPayloadInput,
  type ErrorPayload,
  type GameView,
  type RoomSnapshot,
  type ServerMessage,
  type SessionInvalidReason,
} from "@party/shared";

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "offline" | "closed";
export type ClosedReason = SessionInvalidReason | "replaced" | "protocol";

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "error";
}

export interface RoomState {
  status: ConnectionStatus;
  closedReason: ClosedReason | null;
  /** Number of consecutive failed reconnect attempts. */
  attempts: number;
  playerId: string | null;
  room: RoomSnapshot | null;
  game: GameView | null;
  /** serverTime − Date.now(), used to render server-clock countdowns. */
  clockOffset: number;
  toasts: Toast[];
}

export class RequestError extends Error {
  constructor(
    readonly code: ErrorPayload["code"] | "TIMEOUT" | "DISCONNECTED",
    message: string,
  ) {
    super(message);
  }
}

const REQUEST_TIMEOUT_MS = 8_000;
const PING_EVERY_MS = 15_000;
const PONG_DEADLINE_MS = 10_000;
const TERMINAL_CLOSES = new Set<number>([
  WS_CLOSE.SESSION_INVALID,
  WS_CLOSE.KICKED,
  WS_CLOSE.LEFT,
  WS_CLOSE.ROOM_CLOSED,
  WS_CLOSE.REPLACED,
]);

function wsUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

/**
 * One live connection to one room. Owns reconnection, request/response
 * correlation and the client-side copy of server state. Server state is never
 * mutated locally; it is only replaced by what the server sends.
 */
export class RoomConnection {
  private ws: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private pending = new Map<string, { resolve: () => void; reject: (e: RequestError) => void; timer: number }>();
  private nextRequest = 1;
  private retryTimer: number | undefined;
  private pingTimer: number | undefined;
  private pongDeadline: number | undefined;
  private toastId = 1;
  private disposed = false;

  state: RoomState = {
    status: "connecting",
    closedReason: null,
    attempts: 0,
    playerId: null,
    room: null,
    game: null,
    clockOffset: 0,
    toasts: [],
  };

  constructor(
    readonly code: string,
    private readonly token: string,
    private readonly onInvalid: (reason: ClosedReason) => void,
  ) {
    window.addEventListener("online", this.wake);
    window.addEventListener("offline", this.onOffline);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.open();
  }

  // ---------------------------------------------------------------- store API

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = () => this.state;

  private set(patch: Partial<RoomState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  toast(message: string, tone: Toast["tone"] = "info") {
    const id = this.toastId++;
    this.set({ toasts: [...this.state.toasts.slice(-2), { id, message, tone }] });
    window.setTimeout(() => this.dismissToast(id), tone === "error" ? 4500 : 3000);
  }

  dismissToast(id: number) {
    if (this.state.toasts.some((t) => t.id === id)) this.set({ toasts: this.state.toasts.filter((t) => t.id !== id) });
  }

  // ---------------------------------------------------------------- requests

  /** Sends a request and resolves on `ack`, rejects on `error`. Never resolves optimistically. */
  request<T extends ClientMessageType>(type: T, payload: ClientPayloadInput<T>): Promise<void> {
    if (this.state.status !== "open" || !this.ws) {
      return Promise.reject(new RequestError("DISCONNECTED", "You're offline. Reconnecting…"));
    }
    const requestId = `${Date.now().toString(36)}-${this.nextRequest++}`;
    return new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new RequestError("TIMEOUT", "The server didn't answer. Try again."));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timer });
      this.ws!.send(JSON.stringify({ v: PROTOCOL_VERSION, type, requestId, payload }));
    });
  }

  /** Like request(), but shows failures as a toast and reports success as a boolean. */
  async run<T extends ClientMessageType>(type: T, payload: ClientPayloadInput<T>): Promise<boolean> {
    try {
      await this.request(type, payload);
      return true;
    } catch (err) {
      this.toast(err instanceof RequestError ? err.message : "Something went wrong.", "error");
      return false;
    }
  }

  gameAction(action: unknown) {
    return this.request("game.action", { action });
  }

  /** Reconnect now, e.g. after "use this tab" when the session was opened elsewhere. */
  retry() {
    if (this.disposed) return;
    window.clearTimeout(this.retryTimer);
    this.set({ closedReason: null, status: "connecting" });
    this.open();
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener("online", this.wake);
    window.removeEventListener("offline", this.onOffline);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.clearTimeout(this.retryTimer);
    this.stopPing();
    this.rejectAll();
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, "bye");
  }

  // ---------------------------------------------------------------- socket lifecycle

  private open() {
    if (this.disposed) return;
    this.ws?.close();
    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type: "session.resume", payload: { token: this.token } }));
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(e.data)) as ServerMessage;
      } catch {
        return;
      }
      this.handle(msg);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.stopPing();
      this.rejectAll();
      if (this.disposed || this.state.status === "closed") return;
      if (TERMINAL_CLOSES.has(e.code)) {
        if (e.code === WS_CLOSE.REPLACED) this.close("replaced");
        return;
      }
      this.scheduleReconnect();
    };
  }

  private handle(msg: ServerMessage) {
    if (msg.replyTo) {
      const p = this.pending.get(msg.replyTo);
      if (p) {
        this.pending.delete(msg.replyTo);
        window.clearTimeout(p.timer);
        if (msg.type === "error") p.reject(new RequestError(msg.payload.code, msg.payload.message));
        else p.resolve();
      }
    }
    switch (msg.type) {
      case "session.resumed":
        this.set({
          status: "open",
          attempts: 0,
          closedReason: null,
          playerId: msg.payload.playerId,
          room: msg.payload.room,
          game: msg.payload.game,
          clockOffset: msg.payload.serverTime - Date.now(),
        });
        this.startPing();
        return;
      case "session.invalid":
        this.close(msg.payload.reason);
        return;
      case "session.replaced":
        this.close("replaced");
        return;
      case "room.snapshot":
        this.set({ room: msg.payload, game: msg.payload.match ? this.state.game : null });
        return;
      case "game.view": {
        const current = this.state.game;
        const v = msg.payload;
        if (current && current.matchId === v.matchId && v.seq < current.seq) return; // stale frame
        this.set({ game: v });
        return;
      }
      case "game.ended":
        this.set({ game: null });
        this.toast(
          msg.payload.reason === "not_enough_players" ? "Not enough players left, so the game stopped." : "The host ended the game.",
        );
        return;
      case "notice":
        this.toast(msg.payload.message);
        return;
      case "pong":
        window.clearTimeout(this.pongDeadline);
        this.set({ clockOffset: msg.payload.serverTime - Date.now() });
        return;
      case "error":
        if (!msg.replyTo && msg.payload.code === "BAD_REQUEST") this.toast(msg.payload.message, "error");
        return;
      case "server.shutdown":
        this.toast("The server is restarting. Rooms will close.", "error");
        return;
      case "ack":
        return;
    }
  }

  private close(reason: ClosedReason) {
    this.stopPing();
    window.clearTimeout(this.retryTimer);
    this.set({ status: "closed", closedReason: reason });
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.onInvalid(reason);
  }

  private scheduleReconnect() {
    const attempts = this.state.attempts + 1;
    this.set({ status: navigator.onLine === false ? "offline" : "reconnecting", attempts });
    const delay = Math.min(8_000, 500 * 2 ** Math.min(attempts - 1, 4)) * (0.75 + Math.random() * 0.5);
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.open(), delay);
  }

  private wake = () => {
    if (this.disposed || this.state.status === "closed" || this.state.status === "open") return;
    window.clearTimeout(this.retryTimer);
    this.set({ status: "reconnecting" });
    this.open();
  };

  private onOffline = () => {
    if (this.state.status !== "closed") this.set({ status: "offline" });
  };

  private onVisibility = () => {
    if (document.visibilityState !== "visible") return;
    // Mobile browsers silently kill sockets in the background: check immediately.
    if (this.state.status === "open") this.ping();
    else this.wake();
  };

  private startPing() {
    this.stopPing();
    this.pingTimer = window.setInterval(() => this.ping(), PING_EVERY_MS);
  }

  private ping() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type: "ping", payload: {} }));
    window.clearTimeout(this.pongDeadline);
    const ws = this.ws;
    // A half-open socket never answers: force a reconnect.
    this.pongDeadline = window.setTimeout(() => ws.close(), PONG_DEADLINE_MS);
  }

  private stopPing() {
    window.clearInterval(this.pingTimer);
    window.clearTimeout(this.pongDeadline);
  }

  private rejectAll() {
    for (const [id, p] of this.pending) {
      window.clearTimeout(p.timer);
      p.reject(new RequestError("DISCONNECTED", "Connection lost. Reconnecting…"));
      this.pending.delete(id);
    }
  }
}
