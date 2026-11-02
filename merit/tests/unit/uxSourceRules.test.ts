import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(SRC).map((p) => ({ p, text: readFileSync(p, "utf8") }));

describe("UX kaynak kuralları", () => {
  it("işlem sonrası başarı modalı yok: 'İşlem tamamlandı' ve 'Kayıt silindi' başlıkları 0", () => {
    const hits = files.filter((f) => /title:\s*"(İşlem tamamlandı|Kayıt silindi)"/.test(f.text)).map((f) => f.p);
    expect(hits).toEqual([]);
  });

  it("her danger:true confirm çağrısında confirmLabel (eylem fiili) bulunur", () => {
    const missing: string[] = [];
    for (const f of files) {
      for (const m of f.text.matchAll(/\bconfirm\(\{/g)) {
        // Brace-balanced options object.
        let depth = 0;
        let i = m.index! + m[0].length - 1;
        const start = i;
        for (; i < f.text.length; i++) {
          if (f.text[i] === "{") depth++;
          else if (f.text[i] === "}" && --depth === 0) break;
        }
        const body = f.text.slice(start, i + 1);
        if (/\bdanger:\s*true\b/.test(body) && !/\bconfirmLabel:/.test(body)) {
          missing.push(`${f.p}:${f.text.slice(0, m.index).split("\n").length}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("tarayıcı diyalogları (confirm/prompt/alert çağrıları) 0", () => {
    const hits: string[] = [];
    const call = /(?<![\w.])(?:window\.|globalThis\.)?(?:confirm|prompt|alert)\((?=["'`$\w])/;
    for (const f of files) {
      f.text.split("\n").forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
        if (/function\s+(confirm|prompt|alert)[(\s]/.test(t)) return;
        if (call.test(line)) hits.push(`${f.p}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
