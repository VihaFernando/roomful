import type { z } from "zod";
import { identitySchema } from "../schemas/identity";
import type { GameMetadata } from "../game-types";
import type { ErrorCode } from "../constants";

export const createRoomBodySchema = identitySchema;
export type CreateRoomBody = z.input<typeof createRoomBodySchema>;

export const joinRoomBodySchema = identitySchema;
export type JoinRoomBody = z.input<typeof joinRoomBodySchema>;

export interface SessionGrant {
  code: string;
  playerId: string;
  /** Opaque bearer token. Sent as the first WebSocket message, never in a URL. */
  token: string;
}

export interface RoomLookup {
  code: string;
  playerCount: number;
  capacity: number;
  status: "lobby" | "in-game";
  joinable: boolean;
}

export interface GameListing extends GameMetadata {
  defaultSettings: unknown;
}

export interface GamesResponse {
  games: GameListing[];
}

export interface HealthResponse {
  ok: true;
  uptimeSeconds: number;
}

export interface ApiError {
  error: { code: ErrorCode; message: string };
}
