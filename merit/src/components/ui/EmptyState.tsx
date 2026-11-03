import type { ReactNode } from "react";

/** Boş liste / sütun bildirimi: kesikli kenar + metin (renk tek başına anlam taşımaz). */
export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div
      className="flex flex-col items-center gap-1 rounded-[var(--radius-m)] border border-dashed border-border p-4 text-center"
      style={{ fontSize: 16 }}
    >
      {icon}
      <p className="font-semibold text-text">{title}</p>
      {hint ? <p className="text-muted" style={{ fontSize: 14 }}>{hint}</p> : null}
    </div>
  );
}
