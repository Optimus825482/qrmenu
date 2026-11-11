import type { MapEntity } from "./idmap";

export interface ValidationResult {
  name: string;
  ok: boolean;
  detail?: string;
  /** WARN: a failed check that is informational only (does not make the run fail). */
  level?: "WARN";
}

export interface EntityCounters {
  read(n?: number): void;
  created(n?: number): void;
  existing(n?: number): void;
  dropped(n: number, reason: string): void;
  failed(n?: number): void;
}

interface EntityData {
  read: number;
  created: number;
  existing: number;
  dropped: number;
  failed: number;
  reasons: Map<string, number>;
}

export type Counts = Record<string, { read: number; created: number; existing: number; dropped: number; failed: number }>;

/** Masks connection strings (postgres://user:pass@host/db) so no secret can reach a report or log. */
export function redact(text: string): string {
  return text.replace(/postgres(?:ql)?:\/\/[^\s'")]+/gi, "postgres://***");
}

/**
 * Human-readable text of any thrown value. Node's dual-stack connection failure is an AggregateError whose own
 * message is EMPTY (the real ECONNREFUSED / ENOTFOUND sits in `errors` / `code`), so the plain `.message` would leave
 * the report without a reason.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const parts: string[] = [];
  const code = (error as { code?: unknown }).code;
  if (error.message) parts.push(error.message);
  const inner = (error as { errors?: unknown }).errors;
  if (Array.isArray(inner)) for (const e of inner) parts.push(e instanceof Error ? e.message : String(e));
  if (typeof code === "string" && !parts.some((x) => x.includes(code))) parts.unshift(code);
  return parts.length ? [...new Set(parts)].join("; ") : error.name;
}

export class Report {
  private readonly entities = new Map<string, EntityData>();
  private readonly warnings = new Map<string, { count: number; message: string; examples: string[] }>();
  private readonly checks: ValidationResult[] = [];
  private readonly stepFailures: { step: string; message: string }[] = [];
  private readonly notes: string[] = [];
  private readonly todos: string[] = [];

  entity(name: MapEntity | string): EntityCounters {
    let d = this.entities.get(name);
    if (!d) {
      d = { read: 0, created: 0, existing: 0, dropped: 0, failed: 0, reasons: new Map() };
      this.entities.set(name, d);
    }
    const data = d;
    return {
      read: (n = 1) => void (data.read += n),
      created: (n = 1) => void (data.created += n),
      existing: (n = 1) => void (data.existing += n),
      dropped: (n, reason) => {
        data.dropped += n;
        data.reasons.set(reason, (data.reasons.get(reason) ?? 0) + n);
      },
      failed: (n = 1) => void (data.failed += n),
    };
  }

  counts(): Counts {
    const out: Counts = {};
    for (const [name, d] of this.entities) {
      out[name] = { read: d.read, created: d.created, existing: d.existing, dropped: d.dropped, failed: d.failed };
    }
    return out;
  }

  /** Legacy − (created + existing + dropped). */
  diff(name: string): number {
    const d = this.entities.get(name);
    return d ? d.read - (d.created + d.existing + d.dropped) : 0;
  }

  warn(code: string, message: string, example?: string): void {
    let w = this.warnings.get(code);
    if (!w) {
      w = { count: 0, message, examples: [] };
      this.warnings.set(code, w);
    }
    w.count += 1;
    if (example !== undefined && w.examples.length < 20) w.examples.push(example);
  }

  warningCount(code: string): number {
    return this.warnings.get(code)?.count ?? 0;
  }

  warningExamples(code: string): string[] {
    return [...(this.warnings.get(code)?.examples ?? [])];
  }

  check(result: ValidationResult): void {
    this.checks.push(result);
  }

  fail(step: string, message: string): void {
    this.stepFailures.push({ step, message: redact(message) });
  }

  note(text: string): void {
    if (!this.notes.includes(text)) this.notes.push(text);
  }

  todo(text: string): void {
    if (!this.todos.includes(text)) this.todos.push(text);
  }

  hasFailures(): boolean {
    if (this.stepFailures.length > 0) return true;
    if (this.checks.some((c) => !c.ok && c.level !== "WARN")) return true;
    for (const d of this.entities.values()) if (d.failed > 0) return true;
    return false;
  }

  toMarkdown(opts: { dryRun: boolean; startedAt: Date; finishedAt: Date }): string {
    const out: string[] = [];
    out.push(opts.dryRun ? "# Göç raporu — KURU ÇALIŞTIRMA" : "# Göç raporu");
    out.push("");
    out.push("## Özet");
    out.push("");
    out.push(
      `- Kip: ${opts.dryRun ? "KURU ÇALIŞTIRMA (tek transaction, geri alındı; hedefe hiçbir şey yazılmadı)" : "gerçek çalıştırma"}`,
    );
    out.push(`- Başlangıç: ${opts.startedAt.toISOString()}`);
    out.push(`- Bitiş: ${opts.finishedAt.toISOString()}`);
    out.push(`- Sonuç: ${this.hasFailures() ? "HATA VAR" : "temiz"}`);
    for (const f of this.stepFailures) out.push(`- Adım hatası (${f.step}): ${f.message}`);
    out.push("");
    out.push("## Satır sayıları");
    out.push("");
    out.push("| Varlık | Legacy | Aktarılan | Zaten vardı | Taşınmadı | Hata | Fark |");
    out.push("|---|---:|---:|---:|---:|---:|---:|");
    for (const [name, d] of this.entities) {
      out.push(
        `| ${name} | ${d.read} | ${d.created} | ${d.existing} | ${d.dropped} | ${d.failed} | ${d.read - (d.created + d.existing + d.dropped)} |`,
      );
    }
    out.push("");
    out.push("## Doğrulamalar");
    out.push("");
    if (this.checks.length === 0) out.push("- (bu çalıştırmada doğrulama yok)");
    for (const c of this.checks) {
      out.push(`- ${c.ok ? "GEÇTİ" : c.level === "WARN" ? "UYARI" : "KALDI"} — ${c.name}${c.detail ? `: ${redact(c.detail)}` : ""}`);
    }
    out.push("");
    out.push("## Uyarılar");
    out.push("");
    if (this.warnings.size === 0) out.push("- (yok)");
    for (const [code, w] of this.warnings) {
      out.push(`- **${code}** (${w.count}): ${redact(w.message)}`);
      for (const ex of w.examples) out.push(`  - ${redact(ex)}`);
    }
    out.push("");
    out.push("## Taşınmayan veya dönüştürülen alanlar");
    out.push("");
    const lines: string[] = [];
    for (const [name, d] of this.entities) {
      for (const [reason, n] of d.reasons) lines.push(`- ${name}: ${n} satır taşınmadı — ${reason}`);
    }
    for (const n of this.notes) lines.push(`- ${redact(n)}`);
    if (lines.length === 0) out.push("- (yok)");
    out.push(...lines);
    out.push("");
    out.push("## Yapılacaklar");
    out.push("");
    if (this.todos.length === 0) out.push("- (yok)");
    for (const t of this.todos) out.push(`- ${redact(t)}`);
    out.push("");
    return out.join("\n");
  }
}
