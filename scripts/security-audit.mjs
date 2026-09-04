import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();
export const secretNames = Object.freeze([
  "SUPABASE_SERVICE_ROLE_KEY",
  "FOOTBALL_DATA_API_TOKEN",
  "SPORTS_SYNC_SECRET",
  "DISCOVERY_CURSOR_SECRET",
  "ASSISTED_DISCOVERY_TOKEN_SECRET",
  "CLOUDFLARE_WORKERS_AI_API_TOKEN",
  "AUTH_RECOVERY_TOKEN_SECRET",
  "TURNSTILE_SECRET",
  "POLAR_ACCESS_TOKEN",
  "POLAR_WEBHOOK_SECRET",
]);

// Scan executable sources and environment examples, not documentation or test
// attack fixtures. Findings identify a rule and path, never credential text.
export function auditSourceFile(path, source) {
  const failures = new Set();
  const sourceFile = /\.[cm]?[jt]sx?$/.test(path);
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(path) || path.startsWith("tests/")) return [];
  if (!sourceFile && !/^\.env(?:\.[\w-]+)*\.example$|^\.env\.example$/.test(path)) return [];
  const fail = (rule) => failures.add(`${path}: ${rule}`);
  if (/NEXT_PUBLIC_(?:[A-Z_]*POLAR[A-Z_]*)/.test(source))
    fail("Polar configuration cannot be public");
  if (/polar_(?:oat|pat)_[A-Za-z0-9_-]{8,}/.test(source)) fail("Polar credential literal");
  if (!sourceFile) {
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(
        /^\s*(POLAR_ACCESS_TOKEN|POLAR_WEBHOOK_SECRET)\s*=\s*["']?([^"'\r\n]+)/,
      );
      if (match && !/^replace-with-[a-z0-9-]+$/.test(match[2]))
        fail("Polar secret value in environment example");
    }
    return [...failures];
  }
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const client = ast.statements.some(
    (statement) =>
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteral(statement.expression) &&
      statement.expression.text === "use client",
  );
  if (client && /\b(?:POLAR_[A-Z_]+|HUDDLE_AUTOMATION_BLOCK_POLAR_NETWORK)\b/.test(source))
    fail("Polar configuration in Client Component");
  const allowedSdk = ["features/venue-billing/polar.ts", "features/venue-billing/webhook.ts"];
  const erasureCallers = [
    "features/account-erasure/actions.ts",
    "features/venue-billing/webhook.ts",
  ];
  const secretAliases = new Set();
  const containsSecret = (node) => {
    if (
      /POLAR_(?:ACCESS_TOKEN|WEBHOOK_SECRET)|\b(?:environment|process\.env)\b/.test(
        node.getText(ast),
      )
    )
      return true;
    if (ts.isIdentifier(node) && secretAliases.has(node.text)) return true;
    return ts.forEachChild(node, containsSecret) === true;
  };
  const collectAliases = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer && containsSecret(node.initializer)) {
      const collectNames = (name) => {
        if (ts.isIdentifier(name)) secretAliases.add(name.text);
        else ts.forEachChild(name, collectNames);
      };
      collectNames(node.name);
    }
    ts.forEachChild(node, collectAliases);
  };
  collectAliases(ast);
  const visit = (node) => {
    let moduleSpecifier;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      moduleSpecifier = node.moduleSpecifier.text;
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        node.expression.getText(ast) === "require") &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      moduleSpecifier = node.arguments[0].text;
    if (moduleSpecifier?.startsWith("@polar-sh/sdk")) {
      if (!allowedSdk.includes(path) || moduleSpecifier !== "@polar-sh/sdk/2026-04")
        fail("Polar SDK import outside approved versioned server boundary");
      if (!/^import ["']server-only["'];/.test(source))
        fail("Polar SDK boundary needs server-only marker");
      if (path === "features/venue-billing/webhook.ts") {
        const bindings = ts.isImportDeclaration(node)
          ? node.importClause?.namedBindings
          : undefined;
        if (
          !bindings ||
          !ts.isNamedImports(bindings) ||
          bindings.elements.some(
            (binding) => (binding.propertyName ?? binding.name).text !== "webhooks",
          )
        )
          fail("webhook may import only the local signature verifier");
      }
    }
    if (
      client &&
      moduleSpecifier &&
      (/venue-billing\/(?:polar|plans)(?:\.ts)?$/.test(moduleSpecifier) ||
        /(?:^|\/)env\/server$/.test(moduleSpecifier))
    )
      fail("server billing import in Client Component");
    if (moduleSpecifier && /(?:venue-billing\/polar|^\.\/polar)(?:\.ts)?$/.test(moduleSpecifier)) {
      if (
        !erasureCallers.includes(path) &&
        (/erasePolarExternalCustomer/.test(node.getText(ast)) ||
          !ts.isImportDeclaration(node) ||
          !node.importClause?.namedBindings ||
          !ts.isNamedImports(node.importClause.namedBindings))
      )
        fail("external-customer erasure import outside cleanup boundary");
    }
    if (
      ts.isCallExpression(node) &&
      /^console\./.test(node.expression.getText(ast)) &&
      node.arguments.some(containsSecret)
    )
      fail("server configuration in logs");
    if (
      (ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node)) &&
      /POLAR_(?:ACCESS_TOKEN|WEBHOOK_SECRET)/.test(node.name.getText(ast)) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      !/^(?:replace-with-|local-polar-no-network-)/.test(node.initializer.text)
    )
      fail("Polar secret literal in source");
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return [...failures];
}

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

function runSecurityAudit() {
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

  for (const path of repositoryFiles) {
    if (existsSync(path))
      failures.push(...auditSourceFile(relative(root, path), readFileSync(path, "utf8")));
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSecurityAudit();
}
