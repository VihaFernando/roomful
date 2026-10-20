import type { PlayerRef, Random } from "@party/game-sdk";
import {
  PROTOCOL_VERSION,
  WS_CLOSE,
  type GameEndedReason,
  type GameView,
  type Identity,
  type RoomLookup,
  type RoomSnapshot,
  type ServerEvents,
  type ServerEventType,
  type SessionGrant,
  type SessionInvalidReason,
} from "@party/shared";
import type { Config } from "../../config/env";
import { MatchRunner } from "../../game-engine/match-runner";
import { AppError } from "../../infrastructure/errors";
import type { Logger } from "../../infrastructure/logger";
import type { Clock, Scheduler } from "../../infrastructure/time";
import { generateId, generateRoomCode } from "../../security/ids";
import type { GameRegistry } from "../games/game-registry";
import { sameNickname, toPublicPlayer, type Player } from "../players/player";
import type { SessionService } from "../sessions/session-service";
import { createRoom, type Room, type RoomStore } from "./room";

/** Delivery boundary to connected clients (implemented by the WebSocket gateway). */
export interface Outbox {
  /** Sends a pre-encoded message to a player if they are connected. */
  send(playerId: string, data: string): void;
  /** Disconnects a player's socket, if any. */
  disconnect(playerId: string, closeCode: number, reason: string): void;
}

export function encode<K extends ServerEventType>(type: K, payload: ServerEvents[K], replyTo?: string): string {
  return JSON.stringify(replyTo ? { v: PROTOCOL_VERSION, type, replyTo, payload } : { v: PROTOCOL_VERSION, type, payload });
}

export interface RoomServiceDeps {
  config: Config;
  store: RoomStore;
  sessions: SessionService;
  registry: GameRegistry;
  clock: Clock;
  scheduler: Scheduler;
  random: Random;
  logger: Logger;
  outbox: Outbox;
}

/**
 * Owns room membership, host rules, presence and the game lifecycle.
 * All methods are synchronous so each operation is atomic per room.
 */
export class RoomService {
  constructor(private readonly d: RoomServiceDeps) {}

  // ---------------------------------------------------------------- lifecycle

  createRoom(identity: Identity): SessionGrant {
    const code = this.uniqueCode();
    const now = this.d.clock.now();
    const player = this.newPlayer(identity, now);
    const room = createRoom(code, player.id, now, this.d.config.ROOM_CAPACITY);
    room.players.set(player.id, player);
    room.scores.ensure(player);
    // Pre-select the first registered game so the lobby is useful immediately.
    const firstGame = this.d.registry.ids()[0];
    if (firstGame) this.selectGameInternal(room, firstGame);
    // Seat reserved until the creator's socket connects.
    this.markAway(room, player, now);
    this.d.store.set(room);
    this.d.logger.info("room created", { room: code });
    return { code, playerId: player.id, token: this.d.sessions.issue(code, player.id) };
  }

  joinRoom(code: string, identity: Identity): SessionGrant {
    const room = this.requireRoom(code);
    if (room.players.size >= room.settings.capacity) throw new AppError("ROOM_FULL", "This room is full.");
    for (const p of room.players.values()) {
      if (sameNickname(p.nickname, identity.nickname)) {
        throw new AppError("NICKNAME_TAKEN", "Someone in this room already has that name.");
      }
    }
    const now = this.d.clock.now();
    const player = this.newPlayer(identity, now);
    room.players.set(player.id, player);
    room.scores.ensure(player);
    this.markAway(room, player, now);
    this.touch(room);
    this.publish(room);
    return { code, playerId: player.id, token: this.d.sessions.issue(code, player.id) };
  }

  lookup(code: string): RoomLookup {
    const room = this.requireRoom(code);
    return {
      code,
      playerCount: room.players.size,
      capacity: room.settings.capacity,
      status: room.match ? "in-game" : "lobby",
      joinable: room.players.size < room.settings.capacity,
    };
  }

  /**
   * A socket authenticated as this player. Sends the full resync via `sendResumed`
   * before anyone else hears about the presence change.
   */
  connected(
    code: string,
    playerId: string,
    sendResumed: (payload: ServerEvents["session.resumed"]) => void,
  ): void {
    const room = this.requireRoom(code);
    const player = this.requirePlayer(room, playerId);
    this.d.scheduler.cancel(player.graceTask);
    player.graceTask = undefined;
    player.presence = "online";
    player.awaySince = null;
    room.emptySince = null;
    if (room.hostId === playerId) {
      this.d.scheduler.cancel(room.hostTask);
      room.hostTask = undefined;
    }
    this.touch(room);
    room.match?.presence(playerId, "online");

    const view = room.match ? room.match.view(playerId) : null;
    if (room.match && view) room.match.markSent(playerId, view);
    sendResumed({ playerId, room: this.snapshot(room), game: view, serverTime: this.d.clock.now() });
    this.publish(room);
  }

  /** The player's socket closed. Their seat is reserved for the grace period. */
  disconnected(code: string, playerId: string) {
    const room = this.d.store.get(code);
    const player = room?.players.get(playerId);
    if (!room || !player || player.presence === "away") return;
    this.markAway(room, player, this.d.clock.now());
    room.match?.forgetViewer(playerId);
    room.match?.presence(playerId, "away");
    this.publish(room);
  }

  leave(code: string, playerId: string) {
    const room = this.requireRoom(code);
    this.requirePlayer(room, playerId);
    this.removePlayer(room, playerId, "left");
  }

  // ---------------------------------------------------------------- room settings

  setReady(code: string, playerId: string, ready: boolean) {
    const room = this.requireRoom(code);
    this.requirePlayer(room, playerId).ready = ready;
    this.publish(room);
  }

  updateProfile(code: string, playerId: string, patch: { nickname?: string; avatarId?: string }) {
    const room = this.requireRoom(code);
    const player = this.requirePlayer(room, playerId);
    if (this.matchRunning(room)) throw new AppError("ROOM_LOCKED", "You can change your profile after this game.");
    if (patch.nickname !== undefined) {
      for (const p of room.players.values()) {
        if (p.id !== playerId && sameNickname(p.nickname, patch.nickname)) {
          throw new AppError("NICKNAME_TAKEN", "Someone in this room already has that name.");
        }
      }
      player.nickname = patch.nickname;
    }
    if (patch.avatarId !== undefined) player.avatarId = patch.avatarId;
    room.scores.ensure(player);
    this.publish(room);
  }

  updateRoomSettings(code: string, actorId: string, patch: { capacity?: number; requireAllReady?: boolean }) {
    const room = this.requireRoom(code);
    this.requireHost(room, actorId);
    if (patch.capacity !== undefined) {
      if (patch.capacity < room.players.size) {
        throw new AppError("BAD_REQUEST", "Capacity can't be lower than the number of players in the room.");
      }
      room.settings.capacity = patch.capacity;
    }
    if (patch.requireAllReady !== undefined) room.settings.requireAllReady = patch.requireAllReady;
    this.publish(room);
  }

  kick(code: string, actorId: string, targetId: string) {
    const room = this.requireRoom(code);
    this.requireHost(room, actorId);
    if (targetId === actorId) throw new AppError("BAD_REQUEST", "You can't remove yourself. Leave the room instead.");
    this.requirePlayer(room, targetId);
    this.removePlayer(room, targetId, "kicked");
  }

  transferHost(code: string, actorId: string, targetId: string) {
    const room = this.requireRoom(code);
    this.requireHost(room, actorId);
    const target = this.requirePlayer(room, targetId);
    if (target.presence !== "online") throw new AppError("BAD_REQUEST", "Only an online player can become host.");
    this.setHost(room, targetId);
    this.publish(room);
  }

  // ---------------------------------------------------------------- games

  selectGame(code: string, actorId: string, gameId: string) {
    const room = this.requireRoom(code);
    this.requireHost(room, actorId);
    if (this.matchRunning(room)) throw new AppError("ROOM_LOCKED", "Finish the current game first.");
    if (!this.d.registry.has(gameId)) throw new AppError("NOT_FOUND", "That game doesn't exist.");
    this.selectGameInternal(room, gameId);
    this.publish(room);
  }

  updateGameSettings(code: string, actorId: string, gameId: string, raw: unknown) {
    const room = this.requireRoom(code);
    this.requireHost(room, actorId);
    if (this.matchRunning(room)) throw new AppError("ROOM_LOCKED", "Settings can be changed between games.");
    const module = this.d.registry.get(gameId);
    if (!module) throw new AppError("NOT_FOUND", "That game doesn't exist.");
    const parsed = module.settingsSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Those settings aren't valid.");
    }
    room.gameSettings.set(gameId, parsed.data);
    this.publish(room);
  }

  startGame(code: string, actorId: string) {
    const room = this.requireRoom(code);
    this.requireHost(room, actorId);
    const blocker = this.startBlocker(room);
    if (blocker) throw new AppError("GAME_NOT_READY", blocker);
    this.beginMatch(room);
  }

  /** Play the same game again with whoever is online, from the results screen. */
  restartGame(code: string, actorId: string) {
    const room = this.requireRoom(code);
    this.requireHost(room, actorId);
    if (!room.match?.completed) throw new AppError("WRONG_PHASE", "The current game hasn't finished yet.");
    this.clearMatch(room);
    const blocker = this.startBlocker(room);
    if (blocker) {
      this.publish(room);
      throw new AppError("GAME_NOT_READY", blocker);
    }
    this.beginMatch(room);
  }

  /** Back to the lobby. Aborts a running match (no scores) or closes finished results. */
  endGame(code: string, actorId: string) {
    const room = this.requireRoom(code);
    this.requireHost(room, actorId);
    const match = room.match;
    if (!match) throw new AppError("WRONG_PHASE", "No game is running.");
    if (!match.completed) this.broadcast(room, encode("game.ended", { matchId: match.matchId, reason: "aborted" }));
    this.clearMatch(room);
    for (const p of room.players.values()) p.ready = false;
    this.publish(room);
  }

  gameAction(code: string, playerId: string, action: unknown) {
    const room = this.requireRoom(code);
    this.requirePlayer(room, playerId);
    if (!room.match) throw new AppError("WRONG_PHASE", "No game is running.");
    const error = room.match.act(playerId, action);
    if (error) throw new AppError(error.code, error.message);
  }

  /** Current view for a member (used on resume and by tests). */
  viewFor(code: string, playerId: string): GameView | null {
    const room = this.d.store.get(code);
    return room?.match ? room.match.view(playerId) : null;
  }

  // ---------------------------------------------------------------- housekeeping

  /** Marks activity; called for every accepted inbound message. */
  touchRoom(code: string) {
    const room = this.d.store.get(code);
    if (room) this.touch(room);
  }

  /** Deletes empty and idle rooms. Call periodically. */
  sweep() {
    const now = this.d.clock.now();
    for (const room of [...this.d.store.values()]) {
      const empty = room.emptySince !== null && now - room.emptySince >= this.d.config.ROOM_EMPTY_TTL_MS;
      const idle = now - room.lastActivityAt >= this.d.config.ROOM_IDLE_TTL_MS;
      if (empty || idle) this.closeRoom(room, empty ? "room_closed" : "expired");
    }
  }

  closeAll() {
    for (const room of [...this.d.store.values()]) this.closeRoom(room, "room_closed");
  }

  snapshot(room: Room): RoomSnapshot {
    const match = room.match;
    return {
      code: room.code,
      hostId: room.hostId,
      status: match ? "in-game" : "lobby",
      settings: { ...room.settings },
      players: [...room.players.values()].map(toPublicPlayer),
      selectedGameId: room.selectedGameId,
      gameSettings: room.selectedGameId ? (room.gameSettings.get(room.selectedGameId) ?? null) : null,
      startBlocker: this.startBlocker(room),
      match: match
        ? {
            matchId: match.matchId,
            gameId: match.gameId,
            participantIds: [...match.participantIds],
            completed: match.completed,
            results: match.outcome
              ? {
                  matchId: match.matchId,
                  gameId: match.gameId,
                  headline: match.outcome.headline,
                  winnerIds: match.outcome.winnerIds,
                  awards: match.outcome.awards,
                }
              : null,
          }
        : null,
      scoreboard: room.scores.standings(),
    };
  }

  getRoom(code: string) {
    return this.d.store.get(code);
  }

  // ---------------------------------------------------------------- internals

  private startBlocker(room: Room): string | null {
    if (!room.selectedGameId) return "Pick a game to play.";
    const module = this.d.registry.get(room.selectedGameId);
    if (!module) return "Pick a game to play.";
    if (this.matchRunning(room)) return "A game is in progress.";
    const online = [...room.players.values()].filter((p) => p.presence === "online");
    const { minPlayers, maxPlayers, name } = module.metadata;
    if (online.length < minPlayers) {
      const missing = minPlayers - online.length;
      return `${name} needs ${missing} more player${missing === 1 ? "" : "s"}.`;
    }
    if (online.length > maxPlayers) return `${name} supports up to ${maxPlayers} players.`;
    const settings = room.gameSettings.get(room.selectedGameId) ?? module.defaultSettings;
    const invalid = module.validateSettings(settings, online.length);
    if (invalid) return invalid;
    if (room.settings.requireAllReady) {
      const waiting = online.filter((p) => !p.ready);
      if (waiting.length === 1) return `Waiting for ${waiting[0]!.nickname} to be ready.`;
      if (waiting.length > 1) return `Waiting for ${waiting.length} players to be ready.`;
    }
    return null;
  }

  private beginMatch(room: Room) {
    const gameId = room.selectedGameId!;
    const module = this.d.registry.get(gameId)!;
    const settings = room.gameSettings.get(gameId) ?? module.defaultSettings;
    const participants = [...room.players.values()].filter((p) => p.presence === "online");
    const matchId = generateId();
    const runner = new MatchRunner(
      matchId,
      module,
      participants.map((p) => p.id),
      {
        clock: this.d.clock,
        random: this.d.random,
        scheduler: this.d.scheduler,
        logger: this.d.logger,
        players: () => this.playerRefs(room),
      },
      {
        onChange: () => {
          if (room.match === runner || room.match === null) this.publish(room);
        },
        onComplete: (outcome) => {
          room.scores.applyMatch(runner.participantIds, outcome.winnerIds, outcome.awards);
          if (outcome.carryOver !== undefined) room.carryOver.set(gameId, outcome.carryOver);
        },
        onAbort: (reason) => {
          if (room.match !== runner) return;
          const why: GameEndedReason = reason === "not_enough_players" ? "not_enough_players" : "aborted";
          this.broadcast(room, encode("game.ended", { matchId, reason: why }));
          room.match = null;
        },
        onNotice: (to, message) => {
          const data = encode("notice", { message });
          if (to === "all") this.broadcast(room, data);
          else for (const id of to) this.d.outbox.send(id, data);
        },
      },
    );
    room.match = runner;
    this.touch(room);
    runner.start(
      settings,
      participants.map((p) => ({ id: p.id, nickname: p.nickname, online: true })),
      room.carryOver.get(gameId),
    );
    this.publish(room);
  }

  private clearMatch(room: Room) {
    room.match?.dispose();
    room.match = null;
  }

  private matchRunning(room: Room) {
    return !!room.match && !room.match.completed;
  }

  private selectGameInternal(room: Room, gameId: string) {
    room.selectedGameId = gameId;
    if (!room.gameSettings.has(gameId)) {
      room.gameSettings.set(gameId, structuredClone(this.d.registry.get(gameId)!.defaultSettings));
    }
  }

  private removePlayer(room: Room, playerId: string, reason: "left" | "kicked" | "timeout") {
    const player = room.players.get(playerId);
    if (!player) return;
    this.d.scheduler.cancel(player.graceTask);
    room.players.delete(playerId);
    room.scores.markLeft(playerId);
    const sessionReason: SessionInvalidReason = reason === "kicked" ? "kicked" : reason === "left" ? "left" : "expired";
    this.d.sessions.revokePlayer(playerId, sessionReason);
    this.d.outbox.send(playerId, encode("session.invalid", { reason: sessionReason }));
    this.d.outbox.disconnect(playerId, reason === "kicked" ? WS_CLOSE.KICKED : WS_CLOSE.LEFT, reason);

    if (room.players.size === 0) {
      this.closeRoom(room, "room_closed");
      return;
    }
    if (room.hostId === playerId) this.autoTransferHost(room);
    room.match?.presence(playerId, "left");
    if (reason === "kicked") this.broadcast(room, encode("notice", { message: `${player.nickname} was removed.` }));
    this.updateEmpty(room);
    this.publish(room);
  }

  private markAway(room: Room, player: Player, now: number) {
    player.presence = "away";
    player.awaySince = now;
    this.d.scheduler.cancel(player.graceTask);
    player.graceTask = this.d.scheduler.at(now + this.d.config.PLAYER_RECONNECT_GRACE_MS, () => {
      const current = room.players.get(player.id);
      if (current?.presence === "away" && this.d.store.get(room.code) === room) {
        this.removePlayer(room, player.id, "timeout");
      }
    });
    if (room.hostId === player.id) {
      this.d.scheduler.cancel(room.hostTask);
      room.hostTask = this.d.scheduler.at(now + this.d.config.HOST_TRANSFER_GRACE_MS, () => {
        room.hostTask = undefined;
        const host = room.players.get(room.hostId);
        if (host?.presence === "away" && this.d.store.get(room.code) === room) {
          if (this.autoTransferHost(room)) this.publish(room);
        }
      });
    }
    this.updateEmpty(room);
  }

  /** Hands host to the earliest-joined online player (else earliest-joined anyone). */
  private autoTransferHost(room: Room): boolean {
    const candidates = [...room.players.values()].filter((p) => p.id !== room.hostId);
    const next = candidates.find((p) => p.presence === "online") ?? (room.players.has(room.hostId) ? undefined : candidates[0]);
    if (!next) return false;
    this.setHost(room, next.id);
    return true;
  }

  private setHost(room: Room, playerId: string) {
    if (room.hostId === playerId) return;
    room.hostId = playerId;
    this.d.scheduler.cancel(room.hostTask);
    room.hostTask = undefined;
    const p = room.players.get(playerId);
    if (p?.presence === "away") this.markAway(room, p, p.awaySince ?? this.d.clock.now());
    if (p) this.broadcast(room, encode("notice", { message: `${p.nickname} is now the host.` }));
  }

  private updateEmpty(room: Room) {
    const anyOnline = [...room.players.values()].some((p) => p.presence === "online");
    if (anyOnline) room.emptySince = null;
    else room.emptySince ??= this.d.clock.now();
  }

  private closeRoom(room: Room, reason: SessionInvalidReason) {
    room.match?.dispose();
    room.match = null;
    this.d.scheduler.cancel(room.hostTask);
    for (const p of room.players.values()) {
      this.d.scheduler.cancel(p.graceTask);
      this.d.sessions.revokePlayer(p.id, reason === "expired" ? "expired" : "room_closed");
      this.d.outbox.send(p.id, encode("session.invalid", { reason }));
      this.d.outbox.disconnect(p.id, WS_CLOSE.ROOM_CLOSED, reason);
    }
    room.players.clear();
    this.d.store.delete(room.code);
    this.d.logger.info("room closed", { room: room.code, reason });
  }

  /** Sends the room snapshot (if changed) and changed game views to online members. */
  private publish(room: Room) {
    if (this.d.store.get(room.code) !== room) return;
    const online = [...room.players.values()].filter((p) => p.presence === "online").map((p) => p.id);
    const snapshot = this.snapshot(room);
    const json = JSON.stringify(snapshot);
    if (json !== room.lastSnapshotJson) {
      room.lastSnapshotJson = json;
      const data = encode("room.snapshot", snapshot);
      for (const id of online) this.d.outbox.send(id, data);
    }
    if (room.match) {
      for (const [id, view] of room.match.changedViews(online)) this.d.outbox.send(id, encode("game.view", view));
    }
  }

  private broadcast(room: Room, data: string) {
    for (const p of room.players.values()) if (p.presence === "online") this.d.outbox.send(p.id, data);
  }

  private playerRefs(room: Room): PlayerRef[] {
    return [...room.players.values()].map((p) => ({ id: p.id, nickname: p.nickname, online: p.presence === "online" }));
  }

  private touch(room: Room) {
    room.lastActivityAt = this.d.clock.now();
  }

  private uniqueCode(): string {
    for (let i = 0; i < 10; i++) {
      const code = generateRoomCode(this.d.random);
      if (!this.d.store.has(code)) return code;
    }
    throw new AppError("INTERNAL", "Couldn't create a room right now. Try again.");
  }

  private newPlayer(identity: Identity, now: number): Player {
    return {
      id: generateId(),
      nickname: identity.nickname,
      avatarId: identity.avatarId,
      ready: false,
      presence: "away",
      joinedAt: now,
      awaySince: now,
    };
  }

  private requireRoom(code: string): Room {
    const room = this.d.store.get(code);
    if (!room) throw new AppError("NOT_FOUND", "That room doesn't exist or has closed.");
    return room;
  }

  private requirePlayer(room: Room, playerId: string): Player {
    const p = room.players.get(playerId);
    if (!p) throw new AppError("FORBIDDEN", "You're not in this room.");
    return p;
  }

  private requireHost(room: Room, actorId: string) {
    this.requirePlayer(room, actorId);
    if (room.hostId !== actorId) throw new AppError("FORBIDDEN", "Only the host can do that.");
  }
}
