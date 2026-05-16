// Zero-dependency launcher: runs the Vite frontend and the API backend
// together. Usage: npm run dev:all   (Ctrl+C stops both)
import { spawn } from "node:child_process";

const procs = [
  { name: "web", run: "npm run dev", cwd: "." },
  { name: "api", run: "npm start", cwd: "server" },
];

const children = procs.map(({ name, run, cwd }) => {
  const child = spawn(run, { cwd, shell: true });
  const tag = `[${name}] `;
  const pipe = (stream) =>
    stream.on("data", (d) =>
      process.stdout.write(
        d
          .toString()
          .split("\n")
          .map((l) => (l ? tag + l : l))
          .join("\n")
      )
    );
  pipe(child.stdout);
  pipe(child.stderr);
  child.on("exit", (code) => {
    console.log(`${tag}exited (${code}). Stopping the other process.`);
    shutdown();
  });
  return child;
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    if (!c.killed) c.kill("SIGTERM");
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
