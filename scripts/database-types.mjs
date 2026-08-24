import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const checkOnly = process.argv.includes("--check");
const outputPath = resolve("types/database.generated.ts");
const temporaryPath = `${outputPath}.tmp`;
const command = "supabase";
const args = ["gen", "types", "--local", "--lang", "typescript", "--schema", "public"];
const result = spawnSync(command, args, {
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
});

if (result.error !== undefined) {
  console.error(`Unable to run the pinned Supabase CLI: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const generatedTypes = `${result.stdout.trimEnd()}\n`;

if (checkOnly) {
  if (!existsSync(outputPath)) {
    console.error("Database types are missing. Run `npm run db:types`.");
    process.exit(1);
  }

  if (readFileSync(outputPath, "utf8") !== generatedTypes) {
    console.error("Database types are stale. Run `npm run db:types` and commit the result.");
    process.exit(1);
  }

  console.log("Database types match the local schema.");
  process.exit(0);
}

mkdirSync(resolve("types"), { recursive: true });
writeFileSync(temporaryPath, generatedTypes, "utf8");
renameSync(temporaryPath, outputPath);
console.log("Generated types/database.generated.ts from the local schema.");
