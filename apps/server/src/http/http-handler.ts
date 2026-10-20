import type { Server } from "bun";
import { resolve, sep } from "node:path";
import {
  createRoomBodySchema,
  joinRoomBodySchema,
  roomCodeSchema,
  type ApiError,
  type ErrorCode,
  type GamesResponse,
  type HealthResponse,
} from "@party/shared";
import type { Config } from "../config/env";
import { AppError, HTTP_STATUS } from "../infrastructure/errors";
import type { Logger } from "../infrastructure/logger";
import type { Clock } from "../infrastructure/time";
import { RATE_RULES, RateLimiter } from "../middleware/rate-limit";
import type { GameRegistry } from "../modules/games/game-registry";
import type { RoomService } from "../modules/rooms/room-service";
import { Gateway, type SocketData } from "../websocket/gateway";

const MAX_BODY_BYTES = 4 * 1024;

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export interface HttpDeps {
  config: Config;
  rooms: RoomService;
  registry: GameRegistry;
  clock: Clock;
  logger: Logger;
  startedAt: number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...SECURITY_HEADERS },
  });
}

function apiError(code: ErrorCode, message: string): Response {
  const body: ApiError = { error: { code, message } };
  return json(body, HTTP_STATUS[code]);
}

export function createHttpHandler(d: HttpDeps) {
  const limits = {
    create: new RateLimiter(RATE_RULES.httpCreateRoom, d.clock),
    join: new RateLimiter(RATE_RULES.httpJoinRoom, d.clock),
    lookup: new RateLimiter(RATE_RULES.httpLookup, d.clock),
  };
  // Relative to the server's working directory (apps/server when started via the scripts).
  const distRoot = resolve(process.cwd(), d.config.WEB_DIST_PATH);

  function clientIp(req: Request, server: Server<SocketData>): string {
    if (d.config.TRUST_PROXY) {
      const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      if (fwd) return fwd;
    }
    return server.requestIP(req)?.address ?? "unknown";
  }

  function originAllowed(req: Request): boolean {
    const origin = req.headers.get("origin");
    if (!origin) return true; // non-browser clients (tests, curl)
    const host = req.headers.get("host");
    try {
      if (host && new URL(origin).host === host) return true;
    } catch {
      return false;
    }
    return d.config.PUBLIC_ORIGIN.includes(origin);
  }

  async function readBody(req: Request): Promise<unknown> {
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > MAX_BODY_BYTES) throw new AppError("BAD_REQUEST", "Request too large.");
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) throw new AppError("BAD_REQUEST", "Request too large.");
    try {
      return JSON.parse(text);
    } catch {
      throw new AppError("BAD_REQUEST", "Malformed JSON.");
    }
  }

  function parseCode(raw: string): string {
    const parsed = roomCodeSchema.safeParse(decodeURIComponent(raw));
    if (!parsed.success) throw new AppError("NOT_FOUND", "That room code isn't valid.");
    return parsed.data;
  }

  function parseIdentity(schema: typeof createRoomBodySchema, body: unknown) {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new AppError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid details.");
    return parsed.data;
  }

  async function api(req: Request, url: URL, ip: string): Promise<Response> {
    const { pathname } = url;
    const method = req.method;

    if (pathname === "/api/health" && method === "GET") {
      const body: HealthResponse = { ok: true, uptimeSeconds: Math.round((d.clock.now() - d.startedAt) / 1000) };
      return json(body);
    }
    if (pathname === "/api/games" && method === "GET") {
      const body: GamesResponse = { games: d.registry.listings() };
      return json(body);
    }
    if (pathname === "/api/rooms" && method === "POST") {
      if (!originAllowed(req)) throw new AppError("FORBIDDEN", "Origin not allowed.");
      if (!limits.create.take(ip)) throw new AppError("RATE_LIMITED", "Too many rooms created. Wait a minute.");
      const identity = parseIdentity(createRoomBodySchema, await readBody(req));
      return json(d.rooms.createRoom(identity), 201);
    }
    const join = pathname.match(/^\/api\/rooms\/([^/]+)\/join$/);
    if (join && method === "POST") {
      if (!originAllowed(req)) throw new AppError("FORBIDDEN", "Origin not allowed.");
      if (!limits.join.take(ip)) throw new AppError("RATE_LIMITED", "Too many attempts. Wait a minute.");
      const code = parseCode(join[1]!);
      const identity = parseIdentity(joinRoomBodySchema, await readBody(req));
      return json(d.rooms.joinRoom(code, identity), 201);
    }
    const lookup = pathname.match(/^\/api\/rooms\/([^/]+)$/);
    if (lookup && method === "GET") {
      if (!limits.lookup.take(ip)) throw new AppError("RATE_LIMITED", "Too many attempts. Wait a minute.");
      return json(d.rooms.lookup(parseCode(lookup[1]!)));
    }
    throw new AppError("NOT_FOUND", "Not found.");
  }

  async function staticFile(url: URL): Promise<Response> {
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const target = resolve(distRoot, rel);
    if (target !== distRoot && !target.startsWith(distRoot + sep)) return new Response("Not found", { status: 404 });
    let file = Bun.file(target);
    let isIndex = false;
    if (!rel || !(await file.exists())) {
      // SPA fallback for client-side routes.
      file = Bun.file(resolve(distRoot, "index.html"));
      isIndex = true;
      if (!(await file.exists())) return new Response("Web app not built", { status: 404 });
    }
    const immutable = !isIndex && rel.startsWith("assets/");
    return new Response(file, {
      headers: {
        ...SECURITY_HEADERS,
        "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
      },
    });
  }

  return async function fetch(req: Request, server: Server<SocketData>): Promise<Response | undefined> {
    const url = new URL(req.url);
    const ip = clientIp(req, server);

    if (url.pathname === "/ws") {
      if (!originAllowed(req)) return new Response("Origin not allowed", { status: 403 });
      if (server.upgrade(req, { data: Gateway.socketData(ip) })) return undefined;
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    if (url.pathname.startsWith("/api/")) {
      try {
        return await api(req, url, ip);
      } catch (err) {
        if (err instanceof AppError) return apiError(err.code, err.message);
        d.logger.error("http handler failed", { path: url.pathname, err });
        return apiError("INTERNAL", "Something went wrong.");
      }
    }

    if (d.config.SERVE_WEB_DIST && (req.method === "GET" || req.method === "HEAD")) return staticFile(url);
    return new Response("Not found", { status: 404, headers: SECURITY_HEADERS });
  };
}
