import { spawn } from "node:child_process";
import path from "node:path";

const repositoryRoot = process.cwd();
const supabaseExecutable = path.join(
  repositoryRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "supabase.cmd" : "supabase",
);

const sensitiveOutput =
  /\b(?:DB URL|JWT secret|anon key|publishable key|secret key|service_role key|ANON_KEY|DB_URL|JWT_SECRET|PUBLISHABLE_KEY|SECRET_KEY|SERVICE_ROLE_KEY)\b/i;

function forwardSafeLines(stream, destination) {
  let pending = "";

  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";

    lines.forEach((line) => {
      destination.write(`${sensitiveOutput.test(line) ? "[local credential redacted]" : line}\n`);
    });
  });
  stream.on("end", () => {
    if (pending.length > 0) {
      destination.write(
        `${sensitiveOutput.test(pending) ? "[local credential redacted]" : pending}\n`,
      );
    }
  });
}

const child = spawn(supabaseExecutable, ["start"], {
  cwd: repositoryRoot,
  env: process.env,
  stdio: ["inherit", "pipe", "pipe"],
});

forwardSafeLines(child.stdout, process.stdout);
forwardSafeLines(child.stderr, process.stderr);

child.on("error", (error) => {
  console.error(`Unable to start local Supabase: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal !== null) {
    console.error(`Local Supabase stopped after signal ${signal}.`);
    process.exitCode = 1;
    return;
  }

  process.exitCode = code ?? 1;
});
