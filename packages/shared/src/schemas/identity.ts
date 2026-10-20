import { z } from "zod";
import {
  AVATAR_IDS,
  NICKNAME_MAX,
  NICKNAME_MIN,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from "../constants";

// Control chars, zero-width & bidi overrides, which allow visual spoofing.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]/g;
const NICKNAME_ALLOWED = /^[\p{L}\p{M}\p{N} .,'!?&_\-]+$/u;

export function normalizeNickname(raw: string): string {
  return raw.normalize("NFC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

export const nicknameSchema = z
  .string()
  .max(64)
  .transform(normalizeNickname)
  .pipe(
    z
      .string()
      .min(NICKNAME_MIN, "Pick a nickname")
      .max(NICKNAME_MAX, `Keep it to ${NICKNAME_MAX} characters`)
      .regex(NICKNAME_ALLOWED, "Letters, numbers, spaces and . , ' ! ? & _ - only"),
  );

export const avatarIdSchema = z.enum(AVATAR_IDS);

const ROOM_CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** Uppercases and strips spaces/dashes so pasted codes like "abc-123" work. */
export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_RE.test(code);
}

export const roomCodeSchema = z
  .string()
  .max(32)
  .transform(normalizeRoomCode)
  .refine(isValidRoomCode, "Room codes are 6 letters or numbers");

export const identitySchema = z.object({
  nickname: nicknameSchema,
  avatarId: avatarIdSchema,
});
export type Identity = z.infer<typeof identitySchema>;
