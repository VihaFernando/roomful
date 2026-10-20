import type { Random } from "@party/game-sdk";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@party/shared";

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

/** 256-bit bearer token. */
export function generateToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Only the hash is stored, so a memory dump doesn't yield usable tokens. */
export function hashToken(token: string): string {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}

/** Non-secret opaque id (players, sessions, matches). */
export function generateId(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(9)));
}

export function generateRoomCode(random: Random): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[random.int(ROOM_CODE_ALPHABET.length)];
  return code;
}
