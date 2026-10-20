import { z } from "zod";
import { DEFAULT_ROOM_CAPACITY, MAX_ROOM_CAPACITY, MIN_ROOM_CAPACITY } from "@party/shared";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .default("false")
  .transform((v) => v === "true" || v === "1");

const ms = (fallback: number) => z.coerce.number().int().min(0).default(fallback);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  PUBLIC_ORIGIN: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  SERVE_WEB_DIST: bool,
  WEB_DIST_PATH: z.string().default("../web/dist"),
  ROOM_CAPACITY: z.coerce.number().int().min(MIN_ROOM_CAPACITY).max(MAX_ROOM_CAPACITY).default(DEFAULT_ROOM_CAPACITY),
  ROOM_EMPTY_TTL_MS: ms(10 * 60_000),
  ROOM_IDLE_TTL_MS: ms(6 * 60 * 60_000),
  PLAYER_RECONNECT_GRACE_MS: ms(2 * 60_000),
  HOST_TRANSFER_GRACE_MS: ms(30_000),
  TRUST_PROXY: bool,
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

/** Config for tests: production-like defaults without reading process.env. */
export function testConfig(overrides: Partial<Config> = {}): Config {
  return { ...loadConfig({ NODE_ENV: "test", LOG_LEVEL: "error" }), ...overrides };
}
