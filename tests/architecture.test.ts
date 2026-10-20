import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function importsOf(dir: string) {
  const out: { file: string; spec: string }[] = [];
  for (const file of new Glob("**/*.{ts,tsx}").scanSync({ cwd: join(root, dir) })) {
    const text = readFileSync(join(root, dir, file), "utf8");
    for (const m of text.matchAll(IMPORT_RE)) out.push({ file: `${dir}/${file}`, spec: (m[1] ?? m[2])! });
  }
  return out;
}

describe("architecture boundaries", () => {
  test("the web app never imports server code", () => {
    const bad = importsOf("apps/web/src").filter(({ spec }) => /apps\/server|@party\/server|\.\.\/\.\.\/\.\.\/server/.test(spec));
    expect(bad).toEqual([]);
  });

  test("the web app only uses type imports from the game SDK", () => {
    const sdk = importsOf("apps/web/src").filter(({ spec }) => spec.startsWith("@party/game-sdk"));
    expect(sdk).toEqual([]);
  });

  test("shared contracts depend on nothing but zod", () => {
    const external = importsOf("packages/shared/src").filter(({ spec }) => !spec.startsWith(".") && spec !== "zod");
    expect(external).toEqual([]);
  });

  test("game modules don't reach into platform internals", () => {
    const bad = importsOf("apps/server/src/games").filter(({ spec }) => /modules\/|websocket\/|http\/|game-engine\//.test(spec));
    expect(bad).toEqual([]);
  });

  test("word lists never live in shared code", () => {
    const files = [...new Glob("**/*.json").scanSync({ cwd: join(root, "packages/shared") })].filter((f) => !f.includes("node_modules") && f !== "package.json" && f !== "tsconfig.json");
    expect(files).toEqual([]);
  });
});
