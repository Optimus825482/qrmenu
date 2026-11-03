"use client";

import { useState } from "react";
import { useSse } from "@/shell/useSse";

export type PrinterState = "ok" | "error" | "unknown";

const EVENTS = ["printer.status", "print.failed", "print.printed"] as const;

/**
 * Yazıcı sağlığı, mevcut SSE olaylarından: `printer.status {ok}` doğrudan durumu belirler,
 * `print.failed` hata, `print.printed` sağlıklı sayılır. Sunucu 90 sn sessiz yazıcı için
 * `printer.status {ok:false, reason:"SESSIZ"}` yayar ("yanıt yok"); sayfa ilk yüklenirken aynı kural
 * `initial` içinde hesaplanır. Olay tabanlıdır: hata birkaç saniye içinde şeride yansır.
 */
export function usePrinterStatus(initial: PrinterState): { state: PrinterState; reason?: string } {
  const [value, setValue] = useState<{ state: PrinterState; reason?: string }>({ state: initial });
  useSse((event) => {
    if (event.type === "printer.status") {
      const payload = event.payload as { ok?: boolean; reason?: string } | undefined;
      if (payload?.ok === true) setValue({ state: "ok" });
      else if (payload?.ok === false) setValue({ state: "error", reason: payload.reason === "SESSIZ" ? "yanıt yok" : undefined });
    } else if (event.type === "print.failed") {
      setValue({ state: "error" });
    } else if (event.type === "print.printed") {
      setValue({ state: "ok" });
    }
  }, EVENTS);
  return value;
}
