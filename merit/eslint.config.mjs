import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated / report output:
    "src/generated/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    // Standalone sub-package (print gateway) — has its own tsconfig/eslint scope:
    "tools/**",
  ]),
]);

export default eslintConfig;
