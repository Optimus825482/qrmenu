"use client";

import { createContext, useContext, type ReactNode } from "react";

const EnvLabelContext = createContext<string | null>(null);

/**
 * Carries the server-side `ENV_LABEL` (e.g. "EĞİTİM") to every client component. Set once in the root layout;
 * empty or missing means a normal (production) instance and nothing is drawn.
 */
export function EnvLabelProvider({ label, children }: { label: string | null | undefined; children: ReactNode }) {
  return <EnvLabelContext.Provider value={label?.trim() || null}>{children}</EnvLabelContext.Provider>;
}

export function useEnvLabel(): string | null {
  return useContext(EnvLabelContext);
}

/** Small environment badge for status bars and footers; renders nothing when no label is configured. */
export function EnvLabel({ className }: { className?: string }) {
  const label = useEnvLabel();
  if (!label) return null;
  return (
    <span
      data-testid="env-label"
      className={className}
      title={`${label} ortamı — gerçek veri değildir`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0 6px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        lineHeight: "18px",
        whiteSpace: "nowrap",
        color: "var(--warn)",
        background: "var(--warn-bg)",
        border: "1px solid var(--warn)",
      }}
    >
      {label}
    </span>
  );
}
