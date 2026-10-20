import { generateId, generateToken, hashToken } from "../../security/ids";
import type { Clock } from "../../infrastructure/time";

export interface Session {
  id: string;
  tokenHash: string;
  roomCode: string;
  playerId: string;
  createdAt: number;
}

/** Storage boundary for sessions. In-memory today; Redis-compatible shape. */
export interface SessionStore {
  put(session: Session): void;
  getByTokenHash(hash: string): Session | undefined;
  getByPlayer(playerId: string): Session | undefined;
  delete(sessionId: string): void;
  deleteByRoom(roomCode: string): void;
}

export class InMemorySessionStore implements SessionStore {
  private byId = new Map<string, Session>();
  private byHash = new Map<string, string>();
  private byPlayer = new Map<string, string>();

  put(s: Session) {
    this.byId.set(s.id, s);
    this.byHash.set(s.tokenHash, s.id);
    this.byPlayer.set(s.playerId, s.id);
  }
  getByTokenHash(hash: string) {
    const id = this.byHash.get(hash);
    return id ? this.byId.get(id) : undefined;
  }
  getByPlayer(playerId: string) {
    const id = this.byPlayer.get(playerId);
    return id ? this.byId.get(id) : undefined;
  }
  delete(sessionId: string) {
    const s = this.byId.get(sessionId);
    if (!s) return;
    this.byId.delete(sessionId);
    this.byHash.delete(s.tokenHash);
    this.byPlayer.delete(s.playerId);
  }
  deleteByRoom(roomCode: string) {
    for (const s of [...this.byId.values()]) if (s.roomCode === roomCode) this.delete(s.id);
  }
  get size() {
    return this.byId.size;
  }
}

/**
 * Issues and resolves resumable guest sessions. A session binds one bearer
 * token to one player seat in one room; it is independent of sockets.
 */
export class SessionService {
  /** Remembers why recently revoked tokens stopped working, for better client messages. */
  private revokedReasons = new Map<string, "kicked" | "left" | "room_closed" | "expired">();

  constructor(
    private readonly store: SessionStore,
    private readonly clock: Clock,
  ) {}

  issue(roomCode: string, playerId: string): string {
    const token = generateToken();
    this.store.put({ id: generateId(), tokenHash: hashToken(token), roomCode, playerId, createdAt: this.clock.now() });
    return token;
  }

  resolve(token: string): { session: Session } | { reason: "kicked" | "left" | "room_closed" | "expired" | "unknown" } {
    const hash = hashToken(token);
    const session = this.store.getByTokenHash(hash);
    if (session) return { session };
    return { reason: this.revokedReasons.get(hash) ?? "unknown" };
  }

  revokePlayer(playerId: string, reason: "kicked" | "left" | "room_closed" | "expired") {
    const s = this.store.getByPlayer(playerId);
    if (!s) return;
    this.rememberRevoked(s.tokenHash, reason);
    this.store.delete(s.id);
  }

  private rememberRevoked(hash: string, reason: "kicked" | "left" | "room_closed" | "expired") {
    if (this.revokedReasons.size > 10_000) this.revokedReasons.clear();
    this.revokedReasons.set(hash, reason);
  }
}
