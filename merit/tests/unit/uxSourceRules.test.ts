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

  describe("P-UX-3: emoji, sürekli animasyon, sabit para birimi", () => {
    function walkAll(dir: string, out: string[] = []): string[] {
      for (const name of readdirSync(dir)) {
        if (name === "generated") continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walkAll(p, out);
        else if (/\.(ts|tsx|css|json)$/.test(name)) out.push(p);
      }
      return out;
    }
    const all = walkAll(SRC).map((p) => ({ p, text: readFileSync(p, "utf8") }));

    it("src içinde emoji/dingbat 0 (oklar, ×, ·, •, geometrik şekiller serbest)", () => {
      const re = /[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u;
      const hits: string[] = [];
      for (const f of all) {
        f.text.split("\n").forEach((line, i) => {
          if (re.test(line)) hits.push(`${f.p}:${i + 1}`);
        });
      }
      expect(hits).toEqual([]);
    });

    it("sürekli animasyon yok: animate-(bounce|ping|pulse) ve animation:...infinite (spin hariç) 0", () => {
      const hits: string[] = [];
      for (const f of all) {
        f.text.split("\n").forEach((line, i) => {
          if (/animate-(bounce|ping|pulse)\b/.test(line)) hits.push(`${f.p}:${i + 1}`);
          // Radar T13: çağrı halkası tek onaylı sürekli animasyondur; istisna yalnız bu dosyaya aittir.
          if (f.p.replaceAll("\\", "/").endsWith("src/modules/radar/ui/motion/motion.css")) return;
          const m = /animation(?:-[a-z]+)?:[^;]*infinite/.exec(line);
          if (m && !/\bspin\b/.test(m[0])) hits.push(`${f.p}:${i + 1}`);
        });
      }
      expect(hits).toEqual([]);
    });

    it(".tsx içinde sabit para birimi simgesi (₺, €) 0 — formatPrice kullanılır", () => {
      const hits: string[] = [];
      for (const f of all) {
        if (!f.p.endsWith(".tsx")) continue;
        f.text.split("\n").forEach((line, i) => {
          if (/[₺€]/.test(line)) hits.push(`${f.p}:${i + 1}`);
        });
      }
      expect(hits).toEqual([]);
    });
  });
});
