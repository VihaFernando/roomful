import type { ErrorCode } from "@party/shared";

/** An expected, user-safe failure. `message` is shown to the user verbatim. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const HTTP_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ROOM_FULL: 409,
  ROOM_LOCKED: 409,
  NICKNAME_TAKEN: 409,
  RATE_LIMITED: 429,
  INVALID_ACTION: 422,
  NOT_YOUR_TURN: 422,
  WRONG_PHASE: 409,
  GAME_NOT_READY: 409,
  INTERNAL: 500,
};
