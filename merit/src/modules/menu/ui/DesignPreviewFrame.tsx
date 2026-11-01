"use client";

import { type ReactNode, useEffect, useState } from "react";
import Frame from "react-frame-component";
import "@/app/(guest)/guest.css";

const FRAME_DOCUMENT = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;background:transparent"><div></div></body></html>`;

/** Copies the guest menu rules out of the parent document so the iframe paints the real menu. */
function guestCss(): string {
  const parts: string[] = ["html,body{margin:0;background:transparent}"];
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules) {
      if (rule.cssText.includes(".g-")) parts.push(rule.cssText);
    }
  }
  return parts.join("\n");
}

/**
 * Isolated phone/tablet screen. react-frame-component renders the guest tree in an iframe,
 * so fixed sheets and sticky bars behave the way they do on a guest's phone.
 */
export function DesignPreviewFrame({ children }: { children: ReactNode }) {
  const [css, setCss] = useState("");

  useEffect(() => {
    const collect = () => setCss(guestCss());
    collect();
    const observer = new MutationObserver(collect);
    observer.observe(document.head, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <Frame
      className="xp-design-frame"
      initialContent={FRAME_DOCUMENT}
      head={
        <style>{`${css}
          html, body, * { scrollbar-width: none; -ms-overflow-style: none; }
          *::-webkit-scrollbar { display: none; width: 0; height: 0; }
        `}</style>
      }
      style={{ border: 0, flex: "1 1 auto", width: "100%", minHeight: 0, background: "transparent" }}
    >
      {children}
    </Frame>
  );
}
