"use client";

import { ReportCenter } from "@/modules/reporting/ui/ReportCenter";

/** Raporlar: the Rapor Merkezi catalogue in a single-column layout (same filters, cards instead of a grid). */
export function ReportsTab() {
  return (
    <div className="mb-stack">
      <ReportCenter variant="mobile" />
    </div>
  );
}
