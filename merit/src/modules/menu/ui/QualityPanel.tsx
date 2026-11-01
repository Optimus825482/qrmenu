"use client";

import type { QualityFinding, QualityLevel } from "../quality";

const ORDER: Record<QualityLevel, number> = { block: 0, warn: 1, info: 2 };
const LABEL: Record<QualityLevel, string> = { block: "ENGEL", warn: "UYARI", info: "BİLGİ" };

/**
 * Live quality findings of the design being edited. The level is spelled out ("ENGEL" / "UYARI" /
 * "BİLGİ") so it never relies on colour alone.
 */
export function QualityPanel({ findings, id }: { findings: QualityFinding[]; id?: string }) {
  const sorted = [...findings].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  return (
    <section className="xp-design-quality" id={id} aria-label="Kalite kontrolü">
      <strong>Kalite kontrolü</strong>
      {sorted.length === 0 ? (
        <p className="xp-design-quality-ok" role="status">
          Sorun bulunmadı
        </p>
      ) : (
        <ul>
          {sorted.map((finding) => (
            <li key={finding.id} data-level={finding.level}>
              <span className="xp-design-quality-level">{LABEL[finding.level]}</span>
              <span>{finding.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
