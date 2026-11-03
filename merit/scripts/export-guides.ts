/**
 * Dumps every guide text (screens and routines) into one approval table for Erkan (decision S6).
 * Interprets nothing: it only prints what `screenGuide.ts` holds.   npx tsx scripts/export-guides.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GENERIC_ACTION_TEXT, ROLE_ROUTINES, SCREEN_GUIDES } from "../src/modules/core/screenGuide";
import { SCREENS } from "../src/modules/core/screens";

const cell = (text: string) => text.replace(/\|/g, "\|").replace(/\r?\n/g, " ");

const lines: string[] = [
  "# Rehber metinleri — onay listesi",
  "",
  "Bu dosya `scripts/export-guides.ts` ile üretilir; elle düzenlenmez. Değişiklik için `src/modules/core/screenGuide.ts` düzenlenir ve betik yeniden çalıştırılır.",
  "",
  "## Genel eylem cümleleri",
  "",
  "| Eylem | Cümle |",
  "|---|---|",
  ...Object.entries(GENERIC_ACTION_TEXT).map(([action, text]) => `| ${action} | ${cell(text)} |`),
  "",
  "## Ekranlar",
  "",
  "| Kod | Ekran | Sürüm | Bağlam | Amaç | Ekrana özel eylem cümleleri | Adımlar | Sık hatalar | Onay |",
  "|---|---|---|---|---|---|---|---|---|",
];

for (const screen of SCREENS) {
  const g = SCREEN_GUIDES[screen.code];
  if (!g) {
    lines.push(`| ${screen.code} | ${cell(screen.name)} | - | - | REHBER KAYDI YOK | - | - | - | [ ] |`);
    continue;
  }
  const actions = Object.entries(g.actions ?? {}).map(([a, t]) => `${a}: ${t}`).join("<br>");
  const steps = g.steps.map((s, i) => `${i + 1}. ${s.title}: ${s.body}`).join("<br>");
  const mistakes = g.mistakes.map((m) => `- ${m}`).join("<br>");
  lines.push(
    `| ${g.code} | ${cell(screen.name)} | ${g.version} | ${g.context} | ${cell(g.purpose)} | ${cell(actions) || "-"} | ${cell(steps)} | ${cell(mistakes)} | [ ] |`,
  );
}

lines.push("", "## Günlük rutinler", "", "| Rutin | Rol | Maddeler | Onay |", "|---|---|---|---|");
for (const r of ROLE_ROUTINES) {
  const items = r.items.map((i, n) => `${n + 1}. ${i.label}${i.auto ? ` (otomatik: ${i.auto})` : ""}`).join("<br>");
  lines.push(`| ${cell(r.title)} | ${r.roleCode} | ${cell(items)} | [ ] |`);
}

const out = path.resolve(__dirname, "../../docs/kabul/ux-rehber-metinleri.md");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${lines.join("\n")}\n`, "utf8");
console.log(`Yazıldı: ${out}`);
