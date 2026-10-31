"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setupGuideSummaryAction } from "@/modules/core/server/admin/actions/setupGuide";
import type { SetupSummaryRow } from "@/modules/core/server/admin/setupGuide";

const REFRESH_DEBOUNCE_MS = 1000;

/**
 * Kurulum % of every hotel the user may see the setup guide of (Komuta Merkezi card): loads on
 * mount and when `scheduleRefresh()` is called (debounced 1 s; call it on `definition.changed`).
 * A denied or failed load leaves the card empty: the card is a courtesy, not a screen of its own.
 */
export function useSetupSummary() {
  const [rows, setRows] = useState<SetupSummaryRow[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++latest.current;
    let next: SetupSummaryRow[] = [];
    try {
      const result = await setupGuideSummaryAction();
      if (result.ok) next = result.data;
    } catch {
      // keep the empty card
    }
    if (request === latest.current) setRows(next);
  }, []);

  const scheduleRefresh = useCallback(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    return () => {
      clearTimeout(first);
      clearTimeout(debounce.current);
    };
  }, [refresh]);

  return { rows, scheduleRefresh };
}
