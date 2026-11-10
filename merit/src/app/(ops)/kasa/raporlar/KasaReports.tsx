"use client";

import type { CSSProperties } from "react";
import { ReportCenter } from "@/modules/reporting/ui/ReportCenter";

/** The mobile report styles read the Android shell tokens; outside .mb-shell they map to the same app tokens. */
const TOKENS = {
  "--mb-surface": "var(--surface)",
  "--mb-text": "var(--text)",
  "--mb-muted": "var(--muted)",
  "--mb-line": "var(--app-line)",
  "--mb-primary": "var(--accent-app)",
} as CSSProperties;

export function KasaReports() {
  return (
    <main className="p-4" style={TOKENS}>
      <ReportCenter variant="mobile" />
    </main>
  );
}
