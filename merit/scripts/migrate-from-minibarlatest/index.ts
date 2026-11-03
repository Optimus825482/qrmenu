import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ConfigError, parseConfig, STEP_NAMES, type MigrationConfig, type StepName } from "./config";
import { IdMap } from "./idmap";
import { LegacyReader } from "./legacy";
import { Report, redact } from "./report";
import { runDefinitions } from "./steps/definitions";
import { runHistory } from "./steps/history";
import { runUsers } from "./steps/users";
import type { StepContext, StepFn, TxClient } from "./types";

export type { StepContext, StepFn } from "./types";

/** Thrown at the end of a dry run to roll the single outer transaction back. */
export class DryRunRollback extends Error {
  constructor() {
    super("Kuru çalıştırma geri alındı");
    this.name = "DryRunRollback";
  }
}

/** Steps implemented so far; the remaining ones are added by the later migration tasks. */
const STEPS: Partial<Record<StepName, StepFn>> = {
  definitions: runDefinitions,
  users: runUsers,
  history: runHistory,
};

export interface MainHooks {
  /** Replaces the real steps (tests). */
  steps?: StepFn[];
  log?: (line: string) => void;
}

async function resolveActor(db: PrismaClient, cfg: MigrationConfig): Promise<string> {
  const user = cfg.actor
    ? await db.user.findFirst({ where: { username: cfg.actor, isActive: true }, select: { id: true } })
    : await db.user.findFirst({
        where: { isActive: true, role: { code: "R-SYS" } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
  if (!user) throw new ConfigError("Aktör kullanıcı bulunamadı; önce seed çalıştırın");
  return user.id;
}

export async function main(argv: string[], env: Record<string, string | undefined>, hooks: MainHooks = {}): Promise<number> {
  const log = hooks.log ?? ((line: string) => console.log(line));
  const startedAt = new Date();
  const report = new Report();
  let cfg: MigrationConfig;
  try {
    cfg = parseConfig(argv, env);
  } catch (error) {
    log(redact(error instanceof Error ? error.message : String(error)));
    return error instanceof ConfigError ? 2 : 1;
  }

  const prisma = new PrismaClient({
    // Same session time zone as src/lib/pgAdapter (UTC); the migration runs one statement at a time, so a small pool
    // keeps a shared database server from running out of connections.
    adapter: new PrismaPg({ connectionString: cfg.targetUrl, options: "-c TimeZone=UTC", max: 3 }),
  });
  const legacy = new LegacyReader(cfg.legacyUrl, cfg.legacySchema, {
    batch: cfg.batch,
    onWarn: (code, message, example) => report.warn(code, message, example),
  });
  let configError = null as ConfigError | null;
  let counts: ReturnType<Report["counts"]> = {};
  let actorId = "";

  const planned: { name: string; fn: StepFn }[] = hooks.steps
    ? hooks.steps.map((fn, i) => ({ name: `adim-${i + 1}`, fn }))
    : STEP_NAMES.filter((n) => (cfg.only ? cfg.only.includes(n) : true) && !cfg.skip.includes(n)).flatMap((n) => {
        const fn = STEPS[n];
        if (!fn) {
          report.warn("ADIM_YOK", `Adım henüz uygulanmadı, atlandı: ${n}`, n);
          report.todo(`"${n}" adımı bu sürümde yok; sonraki göç görevleriyle eklenecek.`);
          return [];
        }
        return [{ name: n, fn }];
      });

  const runSteps = async (ctx: StepContext): Promise<void> => {
    for (const step of planned) {
      try {
        await step.fn(ctx);
      } catch (error) {
        if (error instanceof ConfigError) {
          configError = error;
          report.fail(step.name, error.message);
        } else {
          report.fail(step.name, error instanceof Error ? error.message : String(error));
        }
        return; // later steps depend on earlier ones: stop at the first failure
      }
    }
  };

  const baseCtx = (tx: StepContext["tx"]): StepContext => ({
    legacy,
    ids: (db: TxClient) => new IdMap(db),
    report,
    cfg,
    actorId,
    dryRun: cfg.dryRun,
    tx,
  });

  let started = false;
  try {
    actorId = await resolveActor(prisma, cfg);
    started = true;
    if (cfg.dryRun) {
      try {
        await prisma.$transaction(
          async (db) => {
            await runSteps(baseCtx((fn) => fn(db)));
            throw new DryRunRollback();
          },
          { timeout: 3_600_000, maxWait: 60_000 },
        );
      } catch (error) {
        if (!(error instanceof DryRunRollback)) throw error;
      }
    } else {
      await runSteps(baseCtx((fn) => prisma.$transaction(fn, { timeout: 300_000, maxWait: 60_000 })));
    }
    counts = report.counts();
    if (!cfg.dryRun && !configError) {
      await prisma.auditLog.create({
        data: {
          userId: actorId,
          action: "LEGACY_MIGRATION",
          entity: "migration",
          after: { mode: "real", failed: report.hasFailures(), counts },
        },
      });
    }
  } catch (error) {
    if (error instanceof ConfigError) configError = error;
    else report.fail("main", error instanceof Error ? error.message : String(error));
    if (error instanceof ConfigError) report.fail("yapilandirma", error.message);
  } finally {
    await legacy.close().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  }

  const finishedAt = new Date();
  const markdown = report.toMarkdown({ dryRun: cfg.dryRun, startedAt, finishedAt });
  try {
    const target = path.resolve(cfg.reportPath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, markdown, "utf8");
    log(`Rapor yazıldı: ${target}`);
  } catch (error) {
    log(redact(`Rapor yazılamadı: ${error instanceof Error ? error.message : String(error)}`));
  }

  if (configError) {
    log(redact(configError.message));
    return 2;
  }
  if (!started || report.hasFailures()) return 1;
  return 0;
}

if (/^index\.[cm]?[jt]s$/.test(path.basename(process.argv[1] ?? ""))) {
  main(process.argv.slice(2), process.env).then(
    (code) => process.exit(code),
    (error) => {
      console.error(redact(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    },
  );
}
