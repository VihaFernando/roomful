import type { AnyGameModule, Random } from "@party/game-sdk";
import type { Config } from "./config/env";
import { gameModules } from "./games";
import { createHttpHandler } from "./http/http-handler";
import { createLogger, type Logger } from "./infrastructure/logger";
import { cryptoRandom } from "./infrastructure/random";
import { createSystemScheduler, systemClock, type Clock, type Scheduler } from "./infrastructure/time";
import { GameRegistry } from "./modules/games/game-registry";
import { InMemoryRoomStore } from "./modules/rooms/room";
import { RoomService, encode } from "./modules/rooms/room-service";
import { InMemorySessionStore, SessionService } from "./modules/sessions/session-service";
import { Gateway } from "./websocket/gateway";

export interface AppOverrides {
  clock?: Clock;
  scheduler?: Scheduler;
  random?: Random;
  logger?: Logger;
  games?: readonly AnyGameModule[];
}

/** Composition root. Everything is injectable so tests can control time and randomness. */
export function createApp(config: Config, o: AppOverrides = {}) {
  const clock = o.clock ?? systemClock;
  const scheduler = o.scheduler ?? createSystemScheduler(clock);
  const random = o.random ?? cryptoRandom;
  const logger = o.logger ?? createLogger(config.LOG_LEVEL);
  const registry = new GameRegistry(o.games ?? gameModules);
  const sessions = new SessionService(new InMemorySessionStore(), clock);
  const gateway = new Gateway({ sessions, clock, scheduler, logger });
  const rooms = new RoomService({
    config,
    store: new InMemoryRoomStore(),
    sessions,
    registry,
    clock,
    scheduler,
    random,
    logger,
    outbox: gateway,
  });
  gateway.attach(rooms);
  const fetch = createHttpHandler({ config, rooms, registry, clock, logger, startedAt: clock.now() });

  let sweeper: ReturnType<typeof setInterval> | undefined;
  return {
    config,
    rooms,
    gateway,
    registry,
    fetch,
    websocket: gateway.handler,
    startSweeper(intervalMs = 30_000) {
      sweeper = setInterval(() => rooms.sweep(), intervalMs);
    },
    shutdown() {
      if (sweeper) clearInterval(sweeper);
      gateway.broadcastAll(encode("server.shutdown", {}));
      rooms.closeAll();
    },
  };
}

export type App = ReturnType<typeof createApp>;
