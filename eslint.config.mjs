import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  prettier,
  globalIgnores([
    ".next/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "out/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);
