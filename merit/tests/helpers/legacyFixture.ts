import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const FIXTURE = path.resolve(__dirname, "../fixtures/legacy-dump.sql");

function testUrl(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is not set (merit/.env)");
  return url;
}

function checkSchema(schema: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema) || schema === "public") throw new Error(`Geçersiz legacy şeması: ${schema}`);
  return schema;
}

/** Drops and rebuilds the synthetic legacy tables in `schema` of the test database. */
export async function loadLegacyFixture(schema = "legacy_fx"): Promise<void> {
  checkSchema(schema);
  const sql = fs.readFileSync(FIXTURE, "utf8");
  const client = new pg.Client({ connectionString: testUrl() });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE; CREATE SCHEMA "${schema}"; SET search_path TO "${schema}";`);
    await client.query(sql);
  } finally {
    await client.end();
  }
}

/** Runs a statement against the legacy schema (scenario tweaks in tests). */
export async function legacyExec(sql: string, schema = "legacy_fx"): Promise<void> {
  checkSchema(schema);
  const client = new pg.Client({ connectionString: testUrl() });
  await client.connect();
  try {
    await client.query(`SET search_path TO "${schema}"; ${sql}`);
  } finally {
    await client.end();
  }
}

export async function dropLegacyFixture(schema = "legacy_fx"): Promise<void> {
  checkSchema(schema);
  const client = new pg.Client({ connectionString: testUrl() });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await client.end();
  }
}
