"use client";

import type { AppProps } from "@/shell/registry";
import { ReportCenter } from "./ReportCenter";

/** Rapor Merkezi (core.rapor, CR-RAP): permission-filtered catalogue of every module's reports. `initialPanel` = report key. */
export function ReportCenterWindow({ initialPanel, setStatus }: AppProps) {
  return (
    <div className="rc-window">
      <ReportCenter variant="window" initialKey={initialPanel} setStatus={setStatus} />
    </div>
  );
}
