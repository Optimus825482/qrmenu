import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GENERIC_ACTION_TEXT,
  ROLE_ROUTINES,
  ROUTINE_AUTO_KEYS,
  SCREEN_GUIDES,
  guideFor,
} from "@/modules/core/screenGuide";
import { routeOf } from "@/modules/core/screenPaths";
import { SCREENS } from "@/modules/core/screens";

function allTexts(): string[] {
  const out: string[] = [...Object.values(GENERIC_ACTION_TEXT)];
  for (const g of Object.values(SCREEN_GUIDES)) {
    out.push(g.purpose, ...g.mistakes, ...Object.values(g.actions ?? {}));
    for (const s of g.steps) out.push(s.title, s.body);
  }
  for (const r of ROLE_ROUTINES) out.push(r.title, ...r.items.map((i) => i.label));
  return out;
}

describe("screenGuide kataloğu", () => {
  it("katalogdaki her ekranın rehberi var, fazladan kayıt yok", () => {
    expect(SCREENS).toHaveLength(36);
    for (const s of SCREENS) {
      const g = SCREEN_GUIDES[s.code];
      expect(g, s.code).toBeDefined();
      expect(g.code).toBe(s.code);
      expect(g.purpose.trim().length, s.code).toBeGreaterThan(0);
      expect(g.steps.length, s.code).toBeGreaterThanOrEqual(3);
      expect(g.steps.length, s.code).toBeLessThanOrEqual(5);
      expect(g.mistakes.length, s.code).toBeGreaterThan(0);
      expect(g.version).toBeGreaterThanOrEqual(1);
      expect(guideFor(s.code)).toBe(g);
    }
    expect(Object.keys(SCREEN_GUIDES).sort()).toEqual(SCREENS.map((s) => s.code).sort());
  });

  it("adım hedefleri biçim kuralına uyar ve ekran içinde tekildir", () => {
    for (const g of Object.values(SCREEN_GUIDES)) {
      const targets = g.steps.map((s) => s.target);
      for (const t of targets) expect(t, g.code).toMatch(/^[a-z0-9-]+$/);
      expect(new Set(targets).size, g.code).toBe(targets.length);
    }
  });

  it("bağlam (xp / personel / pos) ekranın doğal kabuğuyla uyumlu", () => {
    for (const s of SCREENS) {
      const route = routeOf(s);
      const isPos = ["/kasa", "/kds"].some((r) => route === r || route.startsWith(`${r}/`));
      const expected = route === "/admin" || route.startsWith("/admin/") || route === "/radar" ? "xp" : isPos ? "pos" : "personel";
      expect(SCREEN_GUIDES[s.code].context, s.code).toBe(expected);
    }
  });

  it("metinlerde emoji, 'sepet' ve Evet/Hayır yok; eylem cümleleri tanımlı", () => {
    for (const text of allTexts()) {
      expect(text, text).not.toMatch(/\p{Extended_Pictographic}|[✀-➿]/u);
      expect(text, text).not.toMatch(/sepet/i);
      expect(text, text).not.toMatch(/\b(evet|hayır)\b/i);
    }
    expect(Object.keys(GENERIC_ACTION_TEXT)).toEqual(["V", "O", "D", "A", "R"]);
  });

  it("altı rutin var; maddeler katalogdaki ekranlara ve tanımlı otomatik işaretlere bağlı", () => {
    expect(ROLE_ROUTINES).toHaveLength(6);
    expect(ROUTINE_AUTO_KEYS).toHaveLength(6);
    const codes = new Set(SCREENS.map((s) => s.code));
    const ids = new Set<string>();
    for (const r of ROLE_ROUTINES) {
      expect(ids.has(r.id), r.id).toBe(false);
      ids.add(r.id);
      expect(codes.has(r.host.code), r.id).toBe(true);
      expect(r.items.length).toBeGreaterThan(0);
      for (const item of r.items) {
        expect(codes.has(item.screen), `${r.id}/${item.id}`).toBe(true);
        if (item.auto) expect(ROUTINE_AUTO_KEYS).toContain(item.auto);
      }
      expect(new Set(r.items.map((i) => i.id)).size).toBe(r.items.length);
    }
  });

  it("bilinmeyen ekran için guideFor hata verir", () => {
    expect(() => guideFor("XX-YOK")).toThrow();
  });
});

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Targets that cannot exist yet, with the reason; the tour skips a step whose target is absent, so
 * nothing breaks meanwhile. Remove an entry when its element appears.
 */
const PENDING_TARGETS: Record<string, string> = {};

/** Every string literal inside `data-guide="x"` / `data-guide={cond ? "x" : undefined}` / `newGuide="x"`. */
function guideAttributeTargets(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(/(?:data-guide|newGuide)=(?:"([^"]+)"|\{([^}]*)\})/g)) {
    if (match[1]) found.add(match[1]);
    else for (const lit of (match[2] ?? "").matchAll(/"([a-z0-9-]+)"/g)) found.add(lit[1]);
  }
  return found;
}

describe("rehber hedefleri kaynakta", () => {
  const text = sourceFiles(path.resolve(import.meta.dirname, "../../src"))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const present = guideAttributeTargets(text);

  it("her adım hedefi için kaynakta data-guide özniteliği vardır", () => {
    const missing: string[] = [];
    for (const g of Object.values(SCREEN_GUIDES)) {
      for (const step of g.steps) {
        if (step.target in PENDING_TARGETS) continue;
        if (!present.has(step.target)) missing.push(`${g.code}/${step.target}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("bekleyen listesindeki bir hedef kaynakta belirirse listeden çıkarılır", () => {
    const stale = Object.keys(PENDING_TARGETS).filter((t) => present.has(t));
    expect(stale).toEqual([]);
  });
});
