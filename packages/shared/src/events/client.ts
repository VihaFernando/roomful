import { z } from "zod";
import { MAX_REQUEST_ID_LENGTH, MAX_ROOM_CAPACITY, MIN_ROOM_CAPACITY, PROTOCOL_VERSION } from "../constants";
import { avatarIdSchema, nicknameSchema } from "../schemas/identity";

const base = {
  v: z.literal(PROTOCOL_VERSION),
  requestId: z.string().min(1).max(MAX_REQUEST_ID_LENGTH).optional(),
};

const empty = z.object({}).strict();
const playerId = z.string().min(1).max(64);
const gameId = z.string().min(1).max(64);

function msg<T extends string, P extends z.ZodType>(type: T, payload: P) {
  return z.object({ ...base, type: z.literal(type), payload });
}

/** Every message a client may send. Anything else is rejected. */
export const clientMessageSchema = z.discriminatedUnion("type", [
  msg("session.resume", z.object({ token: z.string().min(16).max(128) })),
  msg("ping", empty),
  msg("room.leave", empty),
  msg(
    "room.updateSettings",
    z
      .object({
        capacity: z.number().int().min(MIN_ROOM_CAPACITY).max(MAX_ROOM_CAPACITY).optional(),
        requireAllReady: z.boolean().optional(),
      })
      .strict(),
  ),
  msg("room.setReady", z.object({ ready: z.boolean() })),
  msg(
    "room.updateProfile",
    z.object({ nickname: nicknameSchema.optional(), avatarId: avatarIdSchema.optional() }).strict(),
  ),
  msg("room.kick", z.object({ playerId })),
  msg("room.transferHost", z.object({ playerId })),
  msg("game.select", z.object({ gameId })),
  msg("game.updateSettings", z.object({ gameId, settings: z.unknown() })),
  msg("game.start", empty),
  /** Game-specific payload, validated by the active game module. */
  msg("game.action", z.object({ action: z.unknown() })),
  msg("game.restart", empty),
  msg("game.end", empty),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ClientMessageType = ClientMessage["type"];
export type ClientPayload<T extends ClientMessageType> = Extract<ClientMessage, { type: T }>["payload"];
/** Payload shape before zod transforms, i.e. what a client sends. */
export type ClientPayloadInput<T extends ClientMessageType> = Extract<
  z.input<typeof clientMessageSchema>,
  { type: T }
>["payload"];

/** Client message types that require the sender to be the host. */
export const HOST_ONLY: ReadonlySet<ClientMessageType> = new Set<ClientMessageType>([
  "room.updateSettings",
  "room.kick",
  "room.transferHost",
  "game.select",
  "game.updateSettings",
  "game.start",
  "game.restart",
  "game.end",
]);
