import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Personel/POS/XP: tarayıcının yerel diyalogları yasak (spec 2b).
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...["confirm", "prompt", "alert"].map((name) => ({
          name,
          message: "Tarayıcı diyaloğu yasak: notify / confirm / askReason kullanın.",
        })),
      ],
      "no-restricted-properties": [
        "error",
        ...["window", "globalThis"].flatMap((object) =>
          ["confirm", "prompt", "alert"].map((property) => ({
            object,
            property,
            message: "Tarayıcı diyaloğu yasak: notify / confirm / askReason kullanın.",
          })),
        ),
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-*/**",
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
