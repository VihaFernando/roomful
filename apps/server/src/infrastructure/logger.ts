type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Keys whose values must never reach logs (secrets, game content, tokens). */
const REDACT = new Set([
  "token",
  "tokenhash",
  "word",
  "words",
  "role",
  "roles",
  "text",
  "guess",
  "clue",
  "clues",
  "secret",
  "state",
  "payload",
  "action",
  "settings",
]);

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACT.has(k.toLowerCase()) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export function createLogger(level: Level, sink: (line: string) => void = console.log): Logger {
  const min = ORDER[level];
  const log = (lvl: Level, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[lvl] < min) return;
    const entry = { t: new Date().toISOString(), lvl, msg, ...(fields ? (redact(fields) as object) : {}) };
    sink(JSON.stringify(entry));
  };
  return {
    debug: (m, f) => log("debug", m, f),
    info: (m, f) => log("info", m, f),
    warn: (m, f) => log("warn", m, f),
    error: (m, f) => log("error", m, f),
  };
}

export const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
