import { describe, expect, test } from "bun:test";
import { ROOM_CODE_ALPHABET, isValidRoomCode, nicknameSchema, normalizeRoomCode } from "@party/shared";
import { cryptoRandom } from "../infrastructure/random";
import { generateRoomCode, generateToken, hashToken } from "./ids";

describe("room codes", () => {
  test("are 6 chars from the unambiguous alphabet", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode(cryptoRandom);
      expect(code).toHaveLength(6);
      expect(isValidRoomCode(code)).toBe(true);
      for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
    }
  });

  test("are well distributed (no trivially repeating codes)", () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateRoomCode(cryptoRandom)));
    expect(codes.size).toBeGreaterThan(1990);
  });

  test("normalization accepts pasted, lowercase, dashed input", () => {
    expect(normalizeRoomCode(" abc-def ")).toBe("ABCDEF");
    expect(isValidRoomCode(normalizeRoomCode("k7m-2pq"))).toBe(true);
    expect(isValidRoomCode("ABC0EF")).toBe(false); // 0 is not in the alphabet
    expect(isValidRoomCode("ABCDE")).toBe(false);
  });
});

describe("tokens", () => {
  test("are high-entropy and unique", () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateToken));
    expect(tokens.size).toBe(1000);
    for (const t of tokens) expect(t.length).toBeGreaterThanOrEqual(43);
  });

  test("hash deterministically and do not equal their hash", () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toBe(t);
  });
});

describe("crypto random", () => {
  test("stays in range and covers all values", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = cryptoRandom.int(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      seen.add(v);
    }
    expect(seen.size).toBe(7);
  });

  test("rejects invalid bounds", () => {
    expect(() => cryptoRandom.int(0)).toThrow();
    expect(() => cryptoRandom.int(1.5)).toThrow();
  });
});

describe("nicknames", () => {
  test("are trimmed, collapsed and stripped of invisible characters", () => {
    expect(nicknameSchema.parse("  Sam   Lee ")).toBe("Sam Lee");
    expect(nicknameSchema.parse("Al​ex")).toBe("Alex");
    expect(nicknameSchema.parse("Zoë")).toBe("Zoë");
  });

  test("reject empty, too long and markup", () => {
    expect(nicknameSchema.safeParse("   ").success).toBe(false);
    expect(nicknameSchema.safeParse("x".repeat(21)).success).toBe(false);
    expect(nicknameSchema.safeParse("<script>").success).toBe(false);
  });
});
