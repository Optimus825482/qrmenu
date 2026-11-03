"use client";

import { useCallback, type RefObject } from "react";

/** A box in any one coordinate system (same fields as a DOMRect). */
export type Rect = { left: number; top: number; width: number; height: number };

export function anchorCenter(r: Rect): { x: number; y: number } {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const f = (n: number) => n.toFixed(1);

/** SVG quadratic path from the centre of `a` to the centre of `b`, bowed to one side. */
export function curvedPath(a: Rect, b: Rect): string {
  const p = anchorCenter(a);
  const q = anchorCenter(b);
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(60, Math.max(12, len * 0.2));
  const cx = (p.x + q.x) / 2 - (dy / len) * bow;
  const cy = (p.y + q.y) / 2 + (dx / len) * bow;
  return `M ${f(p.x)} ${f(p.y)} Q ${f(cx)} ${f(cy)} ${f(q.x)} ${f(q.y)}`;
}

/**
 * Anchors a view may not draw itself fall back to a coarser one: any kitchen stage of an outlet to its single
 * kitchen anchor (`queue:<outlet>:kds`, used by the Masa view), then to the outlet row.
 */
export function anchorCandidates(key: string): string[] {
  const m = /^queue:([^:]+):/.exec(key);
  return m ? [key, `queue:${m[1]}:kds`, `outlet:${m[1]}`] : [key];
}

const esc = (s: string) => s.replace(/["\\]/g, "\\$&");

/**
 * Reads the boxes of the given anchors (relative to `origin`) at call time. Layout is read only when an event
 * starts a motion, never while it runs. Hidden or zero-size anchors are left out.
 */
export function measureAnchors(root: ParentNode, origin: Rect, keys: readonly string[]): Map<string, Rect> {
  const out = new Map<string, Rect>();
  for (const key of keys) {
    for (const cand of anchorCandidates(key)) {
      const el = root.querySelector<Element>(`[data-anchor="${esc(cand)}"]`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      out.set(key, { left: r.left - origin.left, top: r.top - origin.top, width: r.width, height: r.height });
      break;
    }
  }
  return out;
}

/** `measure(layerEl, keys)` bound to the radar root: anchor boxes in the coordinates of the motion layer. */
export function useAnchorRects(rootRef: RefObject<HTMLElement | null>) {
  return useCallback(
    (layer: Element, keys: readonly string[]): Map<string, Rect> => {
      const root = rootRef.current;
      if (!root) return new Map();
      const o = layer.getBoundingClientRect();
      return measureAnchors(root, { left: o.left, top: o.top, width: o.width, height: o.height }, keys);
    },
    [rootRef],
  );
}
