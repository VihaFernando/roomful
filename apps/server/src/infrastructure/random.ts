import type { Random } from "@party/game-sdk";

/** Cryptographically secure, unbiased integers via rejection sampling. */
export const cryptoRandom: Random = {
  int(maxExclusive: number) {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 2 ** 32) {
      throw new RangeError(`invalid bound ${maxExclusive}`);
    }
    const limit = Math.floor(2 ** 32 / maxExclusive) * maxExclusive;
    const buf = new Uint32Array(1);
    for (;;) {
      crypto.getRandomValues(buf);
      const v = buf[0]!;
      if (v < limit) return v % maxExclusive;
    }
  },
};
