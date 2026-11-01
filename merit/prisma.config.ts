import "dotenv/config";
import { defineConfig } from "prisma/config";

const url =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.POSTGRES_USER || "merit_admin"}:${process.env.POSTGRES_PASSWORD || "merit_secure_pass_2026"}@${process.env.POSTGRES_HOST || "postgres"}:5432/${process.env.POSTGRES_DB || "merit"}?schema=public`;

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url,
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
