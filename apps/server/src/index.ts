import { createApp } from "./app";
import { loadConfig } from "./config/env";
import { createLogger } from "./infrastructure/logger";
import type { SocketData } from "./websocket/gateway";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const app = createApp(config, { logger });

const server = Bun.serve<SocketData>({
  hostname: config.HOST,
  port: config.PORT,
  fetch: app.fetch,
  websocket: app.websocket,
});
app.startSweeper();

logger.info("server listening", {
  url: `http://${config.HOST}:${server.port}`,
  env: config.NODE_ENV,
  games: app.registry.ids(),
  servesWeb: config.SERVE_WEB_DIST,
});

let stopping = false;
function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info("shutting down", { signal });
  app.shutdown();
  server.stop();
  setTimeout(() => process.exit(0), 250);
}
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
