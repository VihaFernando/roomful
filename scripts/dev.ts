/**
 * Runs the server and the web app together with prefixed output.
 * Ctrl+C stops both. Usage: bun run dev
 */
const procs = [
  { name: "server", color: "\x1b[38;5;208m", cmd: ["bun", "run", "dev"], cwd: "apps/server" },
  { name: "web", color: "\x1b[38;5;30m", cmd: ["bun", "run", "dev"], cwd: "apps/web" },
].map(({ name, color, cmd, cwd }) => {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe", env: process.env });
  const prefix = `${color}[${name}]\x1b[0m `;
  for (const stream of [proc.stdout, proc.stderr]) {
    (async () => {
      const decoder = new TextDecoder();
      let buffer = "";
      for await (const chunk of stream) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) console.log(prefix + line);
      }
      if (buffer) console.log(prefix + buffer);
    })();
  }
  return { name, proc };
});

function stopAll() {
  for (const { proc } of procs) proc.kill();
}
process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});

const first = await Promise.race(procs.map(({ name, proc }) => proc.exited.then((code) => ({ name, code }))));
console.log(`[${first.name}] exited with code ${first.code}; stopping the rest.`);
stopAll();
process.exit(first.code ?? 1);
