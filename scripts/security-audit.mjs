import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const secretNames = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "FOOTBALL_DATA_API_TOKEN",
  "SPORTS_SYNC_SECRET",
  "DISCOVERY_CURSOR_SECRET",
];

function valuesFromEnvFile(path) {
  const values = new Map();
  if (!existsSync(path)) return values;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match === null || !secretNames.includes(match[1])) continue;
    values.set(match[1], match[2].replace(/^['"]|['"]$/g, ""));
  }

  return values;
}

function localValues() {
  const values = new Map();
  const envPath = join(root, ".env.local");
  const exampleValues = valuesFromEnvFile(join(root, ".env.example"));

  for (const [name, value] of valuesFromEnvFile(envPath)) {
    // Safe setup placeholders are deliberately committed and are not
    // credentials. Ignore only the exact placeholder for the same variable;
    // every distinct local value still receives the literal leak scan.
    if (value.length >= 12 && value !== exampleValues.get(name)) {
      values.set(name, value);
    }
  }

  return values;
}

function filesUnder(path) {
  if (!existsSync(path)) return [];
  const result = [];
  for (const name of readdirSync(path)) {
    const child = join(path, name);
    const stat = statSync(child);
    if (stat.isDirectory()) result.push(...filesUnder(child));
    else if (stat.isFile() && stat.size <= 10_000_000) result.push(child);
  }
  return result;
}

function contains(path, value) {
  try {
    return readFileSync(path).includes(Buffer.from(value));
  } catch {
    return false;
  }
}

const values = localValues();
const artifactRoots = [".next", "coverage", "playwright-report", "test-results"];
const failures = [];
const repositoryFileResult = spawnSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 10 * 1024 * 1024,
  },
);
const repositoryFiles =
  repositoryFileResult.status === 0
    ? repositoryFileResult.stdout
        .toString("utf8")
        .split("\0")
        .filter(Boolean)
        .map((path) => join(root, path))
    : [];

if (repositoryFileResult.status !== 0) {
  failures.push("unable to inventory tracked and untracked repository files");
}

for (const [name, value] of values) {
  if (repositoryFiles.some((path) => contains(path, value))) {
    failures.push(`${name} appears in a repository working-tree file`);
  }

  const history = spawnSync("git", ["log", "--all", `-S${value}`, "--format=%H"], {
    cwd: root,
    encoding: "utf8",
  });
  if (history.status === 0 && history.stdout.trim() !== "") {
    failures.push(`${name} appears in Git history`);
  }

  for (const artifactRoot of artifactRoots) {
    for (const path of filesUnder(join(root, artifactRoot))) {
      if (contains(path, value)) {
        failures.push(`${name} appears in ${artifactRoot} artifacts`);
        break;
      }
    }
  }
}

if (failures.length > 0) {
  failures.forEach((failure) => console.error(`security audit failed: ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    values.size === 0
      ? "Security audit passed; no local secret values were available for literal comparison."
      : `Security audit passed for ${values.size} local secret values without printing them.`,
  );
}
