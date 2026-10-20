import type { Random } from "../types";

/** Fisher–Yates shuffle returning a new array. */
export function shuffle<T>(random: Random, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = random.int(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

export function pick<T>(random: Random, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick() from empty list");
  return items[random.int(items.length)] as T;
}

/**
 * Deterministic PRNG (mulberry32) for tests and replays. NOT for production
 * role assignment — the server injects a crypto-backed Random there.
 */
export function createSeededRandom(seed: number): Random {
  let a = seed >>> 0;
  return {
    int(maxExclusive: number) {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      return Math.floor(r * maxExclusive);
    },
  };
}
