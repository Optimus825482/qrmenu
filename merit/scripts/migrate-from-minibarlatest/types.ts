import type { Prisma } from "../../src/generated/prisma/client";
import type { MigrationConfig } from "./config";
import type { IdMap } from "./idmap";
import type { LegacyReader } from "./legacy";
import type { Report } from "./report";

export type TxClient = Prisma.TransactionClient;

export interface StepContext {
  legacy: LegacyReader;
  /** Id map bound to a transaction client (use inside `tx`). */
  ids: (db: TxClient) => IdMap;
  report: Report;
  cfg: MigrationConfig;
  actorId: string;
  dryRun: boolean;
  /**
   * Real run: every call is its own `$transaction` (steps split work into `cfg.batch` chunks, an interrupted run keeps
   * the finished chunks). Dry run: every call joins the single outer transaction that is rolled back at the end.
   */
  tx<T>(fn: (db: TxClient) => Promise<T>): Promise<T>;
}

export type StepFn = (ctx: StepContext) => Promise<void>;
