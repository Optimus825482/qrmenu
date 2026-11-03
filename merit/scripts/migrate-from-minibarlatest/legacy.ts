import pg from "pg";

export class MissingColumnError extends Error {
  constructor(table: string, column: string) {
    super(`Legacy tabloda zorunlu kolon yok: ${table}.${column}`);
    this.name = "MissingColumnError";
  }
}

export interface RowSpec {
  cols: { name: string; required?: boolean }[];
  /** Keyset paging columns (must be unique together). */
  key: string[];
  /** Static SQL predicate written by the migration code itself (never user input). */
  where?: string;
}

export type WarnSink = (code: string, message: string, example?: string) => void;

const IDENT = /^[a-z_][a-z0-9_]*$/;

function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Geçersiz tanımlayıcı: ${name}`);
  return `"${name}"`;
}

/** Read-only view on the restored legacy database. Every session is read-only; paging is keyset based. */
export class LegacyReader {
  private client: pg.Client | null = null;
  private connecting: Promise<pg.Client> | null = null;
  private readonly columnCache = new Map<string, Set<string>>();
  private readonly warnedMissing = new Set<string>();
  private onWarn?: WarnSink;
  private readonly batch: number;

  constructor(
    private readonly url: string,
    private readonly schema: string,
    opts: { batch?: number; onWarn?: WarnSink } = {},
  ) {
    ident(schema);
    this.batch = Math.max(1, Math.floor(opts.batch ?? 500));
    this.onWarn = opts.onWarn;
  }

  setWarnSink(sink: WarnSink): void {
    this.onWarn = sink;
  }

  private async conn(): Promise<pg.Client> {
    if (this.client) return this.client;
    this.connecting ??= (async () => {
      const c = new pg.Client({ connectionString: this.url });
      await c.connect();
      await c.query("SET default_transaction_read_only = on");
      this.client = c;
      return c;
    })();
    return this.connecting;
  }

  /** Parameterised statement on the read-only session. */
  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const c = await this.conn();
    const res = await c.query(sql, params);
    return res.rows as T[];
  }

  private qualified(table: string): string {
    return `${ident(this.schema)}.${ident(table)}`;
  }

  async tableExists(table: string): Promise<boolean> {
    ident(table);
    const rows = await this.query<{ ok: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2) AS ok",
      [this.schema, table],
    );
    return rows[0]?.ok === true;
  }

  async columns(table: string): Promise<Set<string>> {
    ident(table);
    let set = this.columnCache.get(table);
    if (!set) {
      const rows = await this.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2",
        [this.schema, table],
      );
      set = new Set(rows.map((r) => r.column_name));
      this.columnCache.set(table, set);
    }
    return set;
  }

  async count(table: string): Promise<number> {
    const rows = await this.query<{ n: string }>(`SELECT count(*) AS n FROM ${this.qualified(table)}`);
    return Number(rows[0]?.n ?? 0);
  }

  async *rows<T>(table: string, spec: RowSpec): AsyncGenerator<T[]> {
    const available = await this.columns(table);
    if (available.size === 0) throw new MissingColumnError(table, "(tablo yok)");
    const select: string[] = [];
    const seen = new Set<string>();
    const wanted = [...spec.key.map((name) => ({ name, required: true })), ...spec.cols];
    for (const col of wanted) {
      if (seen.has(col.name)) continue;
      seen.add(col.name);
      if (available.has(col.name)) {
        select.push(ident(col.name));
      } else if (col.required) {
        throw new MissingColumnError(table, col.name);
      } else {
        select.push(`NULL AS ${ident(col.name)}`);
        const id = `${table}.${col.name}`;
        if (!this.warnedMissing.has(id)) {
          this.warnedMissing.add(id);
          this.onWarn?.("KOLON_EKSIK", `Legacy tabloda isteğe bağlı kolon yok, null varsayıldı: ${id}`, id);
        }
      }
    }
    const keyList = spec.key.map(ident).join(", ");
    let last: unknown[] | null = null;
    for (;;) {
      const conds: string[] = [];
      const params: unknown[] = [];
      if (spec.where) conds.push(`(${spec.where})`);
      if (last) {
        conds.push(`(${keyList}) > (${last.map((_, i) => `$${i + 1}`).join(", ")})`);
        params.push(...last);
      }
      const sql =
        `SELECT ${select.join(", ")} FROM ${this.qualified(table)}` +
        (conds.length ? ` WHERE ${conds.join(" AND ")}` : "") +
        ` ORDER BY ${keyList} LIMIT ${this.batch}`;
      const rows = await this.query<Record<string, unknown>>(sql, params);
      if (rows.length === 0) return;
      yield rows as T[];
      if (rows.length < this.batch) return;
      const tail = rows[rows.length - 1];
      last = spec.key.map((k) => tail[k]);
    }
  }

  async close(): Promise<void> {
    const c = this.client;
    this.client = null;
    this.connecting = null;
    if (c) await c.end();
  }
}
