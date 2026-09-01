import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

import { createLocalQualityEnvironment } from "./local-quality-environment.mjs";

const [command, ...commandArguments] = process.argv.slice(2);

if (command === undefined) {
  console.error("Usage: node scripts/with-local-supabase-env.mjs <command> [...arguments]");
  process.exit(1);
}

const repositoryRoot = process.cwd();
const localBinaryDirectory = path.join(repositoryRoot, "node_modules", ".bin");
const supabaseExecutable = path.join(
  localBinaryDirectory,
  process.platform === "win32" ? "supabase.cmd" : "supabase",
);
const statusResult = spawnSync(supabaseExecutable, ["status", "--output", "env"], {
  cwd: repositoryRoot,
  encoding: "utf8",
  env: process.env,
  maxBuffer: 1024 * 1024,
});

if (statusResult.status !== 0) {
  console.error("Local Supabase is unavailable. Run `npm run db:start` first.");
  process.exit(statusResult.status ?? 1);
}

const localEnvironment = {};

for (const line of statusResult.stdout.split(/\r?\n/)) {
  const separatorIndex = line.indexOf("=");
  if (separatorIndex < 1) {
    continue;
  }

  const name = line.slice(0, separatorIndex).trim();
  const rawValue = line.slice(separatorIndex + 1).trim();

  try {
    localEnvironment[name] = JSON.parse(rawValue);
  } catch {
    localEnvironment[name] = rawValue;
  }
}

const requiredValues = ["API_URL", "PUBLISHABLE_KEY", "SERVICE_ROLE_KEY"];
const missingValues = requiredValues.filter((name) => !localEnvironment[name]);

if (missingValues.length > 0) {
  console.error(`Local Supabase did not provide: ${missingValues.join(", ")}.`);
  process.exit(1);
}

const childEnvironment = createLocalQualityEnvironment({
  parentEnvironment: process.env,
  localSupabaseEnvironment: localEnvironment,
  localBinaryDirectory,
  assistedDiscoveryEnabled: command === "playwright",
});

const child = spawn(command, commandArguments, {
  cwd: repositoryRoot,
  env: childEnvironment,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Unable to run ${command}: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal !== null) {
    console.error(`${command} stopped after signal ${signal}.`);
    process.exitCode = 1;
    return;
  }

  process.exitCode = code ?? 1;
});
