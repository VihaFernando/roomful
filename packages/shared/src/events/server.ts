import type { ErrorCode, PROTOCOL_VERSION } from "../constants";
import type { RoomSnapshot } from "../contracts/room";
import type { GameView } from "../game-types";

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
}

export type SessionInvalidReason = "expired" | "kicked" | "left" | "room_closed" | "unknown";
export type GameEndedReason = "aborted" | "not_enough_players";

/** Map of server → client event type to payload. */
export interface ServerEvents {
  /** Full resync after (re)connecting. */
  "session.resumed": { playerId: string; room: RoomSnapshot; game: GameView | null; serverTime: number };
  /** The token can no longer be used; the client should forget it. */
  "session.invalid": { reason: SessionInvalidReason };
  /** This session connected from another tab/device; this socket is being closed. */
  "session.replaced": Record<string, never>;
  pong: { serverTime: number };
  /** Successful reply to a request (correlated via replyTo). */
  ack: Record<string, never>;
  /** Failed reply to a request, or an unsolicited protocol error. */
  error: ErrorPayload;
  "room.snapshot": RoomSnapshot;
  /** This recipient's view of the running game. Only sent when it changed. */
  "game.view": GameView;
  /** The match was stopped early. */
  "game.ended": { matchId: string; reason: GameEndedReason };
  /** Short, non-secret toast text. */
  notice: { message: string };
  "server.shutdown": Record<string, never>;
}

export type ServerEventType = keyof ServerEvents;

export type ServerMessage = {
  [K in ServerEventType]: {
    v: typeof PROTOCOL_VERSION;
    type: K;
    /** requestId of the client message this answers, if any. */
    replyTo?: string;
    payload: ServerEvents[K];
  };
}[ServerEventType];
