import { spawnSync } from "node:child_process";
import path from "node:path";

const repositoryRoot = process.cwd();
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const npxExecutable = process.platform === "win32" ? "npx.cmd" : "npx";
const supabaseExecutable = path.join(
  repositoryRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "supabase.cmd" : "supabase",
);

const gates = [
  ["formatting", ["run", "format:check"]],
  ["lint", ["run", "lint"]],
  ["typecheck", ["run", "typecheck"]],
  ["unit and component coverage", ["run", "test:coverage"]],
  ["database reset", ["run", "db:reset"]],
  ["database schema lint", ["run", "db:lint"]],
  ["database and RLS tests", ["run", "test:db"]],
  ["generated database type drift", ["run", "db:types:check"]],
  ["production build", ["run", "build:local"]],
  ["browser acceptance", ["run", "test:e2e"]],
  ["secret and artifact audit", ["run", "security:audit"]],
];

function run(command, arguments_, label) {
  console.log(`\n[acceptance] ${label}`);
  const result = spawnSync(command, arguments_, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.signal !== null) {
    throw new Error(`${label} stopped after signal ${result.signal}.`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

let acceptanceFailed = false;
let stackStartAttempted = false;
let stackWasRunning = false;

try {
  run(npmExecutable, ["ci"], "clean dependency install");
  run(npxExecutable, ["--no-install", "playwright", "install", "chromium"], "Playwright browser");
  stackWasRunning =
    spawnSync(supabaseExecutable, ["status"], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: "ignore",
    }).status === 0;
  stackStartAttempted = true;
  run(npmExecutable, ["run", "db:start"], "local Supabase startup");
  for (const [label, arguments_] of gates) {
    run(npmExecutable, arguments_, label);
  }
  run("git", ["diff", "--check"], "diff hygiene");
  console.log("\n[acceptance] all repository gates passed");
} catch (error) {
  acceptanceFailed = true;
  console.error(`\n[acceptance] ${error instanceof Error ? error.message : String(error)}`);
} finally {
  if (stackStartAttempted && !stackWasRunning) {
    try {
      run(npmExecutable, ["run", "db:stop"], "local Supabase cleanup");
    } catch (error) {
      acceptanceFailed = true;
      console.error(
        `[acceptance] cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

if (acceptanceFailed) process.exitCode = 1;
