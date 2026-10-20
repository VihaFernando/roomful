export const PROTOCOL_VERSION = 1 as const;

/** Unambiguous alphabet: no 0/O, 1/I/L. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

export const NICKNAME_MIN = 1;
export const NICKNAME_MAX = 20;

export const DEFAULT_ROOM_CAPACITY = 10;
export const MIN_ROOM_CAPACITY = 2;
export const MAX_ROOM_CAPACITY = 16;

/** Maximum size of one WebSocket frame accepted by the server. */
export const MAX_WS_MESSAGE_BYTES = 8 * 1024;
export const MAX_REQUEST_ID_LENGTH = 64;

/** Preset avatars. The web app maps each id to an illustration. */
export const AVATAR_IDS = [
  "fox", "owl", "bear", "cat", "frog", "panda", "koala", "tiger",
  "whale", "otter", "llama", "moose", "crab", "bee", "duck", "snail",
] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

export const ERROR_CODES = [
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "ROOM_FULL",
  "ROOM_LOCKED",
  "NICKNAME_TAKEN",
  "RATE_LIMITED",
  "INVALID_ACTION",
  "NOT_YOUR_TURN",
  "WRONG_PHASE",
  "GAME_NOT_READY",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** WebSocket close codes used by the server (4000–4999 are application-defined). */
export const WS_CLOSE = {
  AUTH_TIMEOUT: 4401,
  SESSION_INVALID: 4403,
  REPLACED: 4409,
  KICKED: 4410,
  ROOM_CLOSED: 4411,
  LEFT: 4412,
  SHUTDOWN: 4503,
} as const;
