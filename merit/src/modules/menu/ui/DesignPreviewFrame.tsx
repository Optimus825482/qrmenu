"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
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
 * Supports smooth mouse drag-to-scroll (touch/swipe emulation) so desktop users can click and drag
 * up/down to scroll through the mobile preview naturally.
 */
function DragScrollArea({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rootEl = containerRef.current;
    if (!rootEl) return;
    const doc = rootEl.ownerDocument;
    const win = doc?.defaultView;
    if (!doc || !win) return;

    let isDown = false;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocityY = 0;
    let velocityX = 0;
    let activeVContainer: HTMLElement | Window = win;
    let activeHContainer: HTMLElement | null = null;
    let startScrollTop = 0;
    let startScrollLeft = 0;
    let rafId: number | null = null;

    const findScrollables = (target: HTMLElement | null) => {
      let cur = target;
      let v: HTMLElement | Window = win;
      let h: HTMLElement | null = null;

      while (cur && cur !== doc.body && cur !== doc.documentElement) {
        const style = win.getComputedStyle(cur);
        const oy = style.overflowY;
        const ox = style.overflowX;

        if (!h && (ox === "auto" || ox === "scroll") && cur.scrollWidth > cur.clientWidth) {
          h = cur;
        }
        if (v === win && (oy === "auto" || oy === "scroll") && cur.scrollHeight > cur.clientHeight) {
          v = cur;
        }
        cur = cur.parentElement;
      }
      return { v, h };
    };

    const getScrollTop = (target: HTMLElement | Window) => {
      if (target === win) {
        return win.scrollY || doc.documentElement.scrollTop || doc.body.scrollTop || 0;
      }
      return (target as HTMLElement).scrollTop;
    };

    const getMaxScrollTop = (target: HTMLElement | Window) => {
      if (target === win) {
        const docEl = doc.documentElement;
        const body = doc.body;
        const scrollHeight = Math.max(docEl.scrollHeight, body.scrollHeight);
        const clientHeight = win.innerHeight || docEl.clientHeight;
        return Math.max(0, scrollHeight - clientHeight);
      }
      const el = target as HTMLElement;
      return Math.max(0, el.scrollHeight - el.clientHeight);
    };

    const setScrollTop = (target: HTMLElement | Window, top: number) => {
      const maxTop = getMaxScrollTop(target);
      const clampTop = Math.max(0, Math.min(maxTop, top));
      if (target === win) {
        win.scrollTo({ top: clampTop, behavior: "instant" });
        doc.documentElement.scrollTop = clampTop;
        doc.body.scrollTop = clampTop;
      } else {
        (target as HTMLElement).scrollTop = clampTop;
      }
    };

    const stopMomentum = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.pointerType === "touch") return;

      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) {
        return;
      }

      stopMomentum();
      isDown = true;
      isDragging = false;
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      lastTime = performance.now();
      velocityX = 0;
      velocityY = 0;

      const { v, h } = findScrollables(target);
      activeVContainer = v;
      activeHContainer = h;
      startScrollTop = getScrollTop(v);
      startScrollLeft = h ? h.scrollLeft : 0;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDown || e.pointerType === "touch") return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!isDragging) {
        if (Math.hypot(dx, dy) > 4) {
          isDragging = true;
          doc.body.classList.add("is-dragging");
        }
      }

      if (isDragging) {
        e.preventDefault();

        const now = performance.now();
        const dt = Math.max(1, now - lastTime);
        const instantVx = (e.clientX - lastX) / dt;
        const instantVy = (e.clientY - lastY) / dt;

        velocityX = velocityX * 0.4 + instantVx * 0.6;
        velocityY = velocityY * 0.4 + instantVy * 0.6;
        lastX = e.clientX;
        lastY = e.clientY;
        lastTime = now;

        setScrollTop(activeVContainer, startScrollTop - dy);

        if (activeHContainer) {
          const maxLeft = Math.max(0, activeHContainer.scrollWidth - activeHContainer.clientWidth);
          activeHContainer.scrollLeft = Math.max(0, Math.min(maxLeft, startScrollLeft - dx));
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDown || e.pointerType === "touch") return;
      isDown = false;

      if (isDragging) {
        doc.body.classList.remove("is-dragging");

        const targetV = activeVContainer;
        const targetH = activeHContainer;
        let vx = velocityX;
        let vy = velocityY;

        const friction = 0.94;
        const minVelocity = 0.05;

        if (Math.abs(vy) > minVelocity || (targetH && Math.abs(vx) > minVelocity)) {
          const step = () => {
            vx *= friction;
            vy *= friction;

            if (Math.abs(vy) > minVelocity) {
              const curTop = getScrollTop(targetV);
              const maxTop = getMaxScrollTop(targetV);
              const nextTop = Math.max(0, Math.min(maxTop, curTop - vy * 16));
              setScrollTop(targetV, nextTop);
              if (nextTop === 0 || nextTop === maxTop) vy = 0;
            }

            if (targetH && Math.abs(vx) > minVelocity) {
              const curLeft = targetH.scrollLeft;
              const maxLeft = Math.max(0, targetH.scrollWidth - targetH.clientWidth);
              const nextLeft = Math.max(0, Math.min(maxLeft, curLeft - vx * 16));
              targetH.scrollLeft = nextLeft;
              if (nextLeft === 0 || nextLeft === maxLeft) vx = 0;
            }

            if (Math.abs(vy) > minVelocity || (targetH && Math.abs(vx) > minVelocity)) {
              rafId = requestAnimationFrame(step);
            } else {
              rafId = null;
            }
          };
          rafId = requestAnimationFrame(step);
        }
      }
    };

    const onClickCapture = (e: MouseEvent) => {
      if (isDragging) {
        e.preventDefault();
        e.stopPropagation();
        isDragging = false;
      }
    };

    const onDragStart = (e: DragEvent) => {
      e.preventDefault();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const target = e.target as HTMLElement | null;
      const { v } = findScrollables(target);
      const curTop = getScrollTop(v);
      setScrollTop(v, curTop + e.deltaY);
    };

    doc.addEventListener("pointerdown", onPointerDown, { capture: true });
    doc.addEventListener("pointermove", onPointerMove, { capture: true });
    doc.addEventListener("pointerup", onPointerUp, { capture: true });
    doc.addEventListener("pointercancel", onPointerUp, { capture: true });
    doc.addEventListener("click", onClickCapture, { capture: true });
    doc.addEventListener("dragstart", onDragStart, { capture: true });
    doc.addEventListener("wheel", onWheel, { passive: false, capture: true });

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      stopMomentum();
      doc.removeEventListener("pointerdown", onPointerDown, { capture: true });
      doc.removeEventListener("pointermove", onPointerMove, { capture: true });
      doc.removeEventListener("pointerup", onPointerUp, { capture: true });
      doc.removeEventListener("pointercancel", onPointerUp, { capture: true });
      doc.removeEventListener("click", onClickCapture, { capture: true });
      doc.removeEventListener("dragstart", onDragStart, { capture: true });
      doc.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="xp-design-drag-scroll-root"
      style={{ width: "100%", minHeight: "100%", display: "flex", flexDirection: "column" }}
    >
      {children}
    </div>
  );
}

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
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&family=Cinzel:wght@400..900&family=Cinzel+Decorative:wght@700&family=Cormorant+Garamond:ital,wght@0,400..700;1,400..700&family=Great+Vibes&family=Marcellus&family=Montserrat:ital,wght@0,300..900;1,300..900&family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Plus+Jakarta+Sans:wght@400..800&display=swap"
          />
          <style>{`${css}
          html {
            overflow-y: auto !important;
            overflow-x: hidden !important;
            height: 100% !important;
            -webkit-overflow-scrolling: touch !important;
            scroll-behavior: smooth;
          }
          body {
            overflow-y: auto !important;
            overflow-x: hidden !important;
            min-height: 100% !important;
            margin: 0;
            background: transparent;
            cursor: grab;
          }
          body.is-dragging,
          body.is-dragging * {
            cursor: grabbing !important;
            user-select: none !important;
            -webkit-user-select: none !important;
          }
          img {
            -webkit-user-drag: none;
            user-drag: none;
          }
          button, a, [role="button"], [role="tab"] {
            cursor: pointer;
          }
          html, body, * { scrollbar-width: none; -ms-overflow-style: none; }
          *::-webkit-scrollbar { display: none; width: 0; height: 0; }
        `}</style>
        </>
      }
      style={{ border: 0, flex: "1 1 auto", width: "100%", minHeight: 0, background: "transparent" }}
    >
      <DragScrollArea>{children}</DragScrollArea>
    </Frame>
  );
}
