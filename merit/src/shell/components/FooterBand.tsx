"use client";

import { useLayoutEffect, useRef } from "react";
import { windowStore } from "../windowStore";

/**
 * Copyright band below the taskbar (Denetim Masası → Marka → "Alt telif bandı"). Its rendered
 * height is FOOTER_HEIGHT plus the PWA safe-area inset (theme.css: .xp-footer-band); it reports
 * the real value to the store so maximized windows and icons never reach under the taskbar.
 */
export function FooterBand() {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => windowStore.getState().setFooterHeight(el.offsetHeight);
    report();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <footer ref={ref} className="xp-footer-band">
      MERIT ROYAL F&amp;B OPERATION COMMAND CENTER © 2026 · CODE BY ERKAN ERDEM
    </footer>
  );
}
