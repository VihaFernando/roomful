/** Type-checks every workspace with its own tsconfig. Usage: bun run typecheck */
const projects = ["packages/shared", "packages/game-sdk", "apps/server", "apps/web", "tests"];

let failed = false;
for (const project of projects) {
  const proc = Bun.spawn(["bun", "x", "tsc", "-p", `${project}/tsconfig.json`, "--noEmit"], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  console.log(`${code === 0 ? "✓" : "✗"} ${project}`);
  if (code !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
