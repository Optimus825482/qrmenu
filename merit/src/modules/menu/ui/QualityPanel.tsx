"use client";

import { useState } from "react";
import type { QualityFinding, QualityLevel } from "../quality";

const ORDER: Record<QualityLevel, number> = { block: 0, warn: 1, info: 2 };
const LABEL: Record<QualityLevel, string> = { block: "ENGEL", warn: "UYARI", info: "BİLGİ" };

/**
 * Live quality findings of the design being edited, positioned to the right of the phone mockup.
 */
export function QualityPanel({ findings, id }: { findings: QualityFinding[]; id?: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const sorted = [...findings].sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  const blockCount = sorted.filter((f) => f.level === "block").length;
  const warnCount = sorted.filter((f) => f.level === "warn").length;

  if (collapsed) {
    return (
      <button
        type="button"
        className="xp-design-quality-collapsed"
        id={id}
        onClick={() => setCollapsed(false)}
        title="Kalite kontrol panelini aç"
        aria-label="Kalite kontrol panelini aç"
      >
        <span className="xp-design-quality-badge-icon">
          {blockCount > 0 ? "⛔" : warnCount > 0 ? "⚠️" : "✓"}
        </span>
        <span className="xp-design-quality-badge-text">
          Kalite ({sorted.length})
        </span>
      </button>
    );
  }

  return (
    <section className="xp-design-quality" id={id} aria-label="Kalite kontrolü">
      <div className="xp-design-quality-header">
        <div className="xp-design-quality-title-wrap">
          <strong>Kalite Kontrolü</strong>
          <span
            className="xp-design-quality-count"
            data-has-block={blockCount > 0 || undefined}
            data-has-warn={warnCount > 0 || undefined}
          >
            {sorted.length === 0 ? "0" : sorted.length}
          </span>
        </div>
        <button
          type="button"
          className="xp-design-quality-close"
          onClick={() => setCollapsed(true)}
          title="Paneli daralt"
          aria-label="Paneli daralt"
        >
          ×
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="xp-design-quality-ok" role="status">
          <span className="xp-design-quality-ok-icon">✓</span>
          <div>
            <strong>Sorun bulunmadı</strong>
            <p>Tasarım ve menü ayarları kurallara uygun.</p>
          </div>
        </div>
      ) : (
        <ul className="xp-design-quality-list">
          {sorted.map((finding) => (
            <li key={finding.id} data-level={finding.level} className="xp-design-quality-item">
              <div className="xp-design-quality-item-header">
                <span className="xp-design-quality-level">{LABEL[finding.level]}</span>
              </div>
              <p className="xp-design-quality-message">{finding.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
