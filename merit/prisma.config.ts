import "dotenv/config";
import { defineConfig } from "prisma/config";

// No fallback credentials: DATABASE_URL is required. Only the Docker build stage (`prisma generate`
// needs no real connection) may set SKIP_ENV_VALIDATION=1 to use a placeholder, mirroring src/lib/env.ts.
const url =
  process.env.DATABASE_URL ||
  (process.env.SKIP_ENV_VALIDATION === "1" ? "postgresql://build:build@localhost:5432/build" : undefined);
if (!url) {
  throw new Error("DATABASE_URL tanımlı olmalı (varsayılanı yoktur)");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url,
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
