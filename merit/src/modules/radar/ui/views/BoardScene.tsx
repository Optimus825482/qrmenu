"use client";

import { useContext, useRef, type ReactNode } from "react";
import { useStore } from "zustand";
import type { RadarState } from "../../state";
import { MotionLayer } from "../motion/MotionLayer";
import { RadarStoreContext } from "../useRadar";

/**
 * The animated scene of one stacked board ("Tüm kompleks"): its own layer over its own lanes, fed by the board's
 * store, so every hotel moves on its own board. Must be rendered inside the board's store provider.
 */
export function BoardScene({ view, enabled, children }: { view: RadarState; enabled: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const store = useContext(RadarStoreContext);
  if (!store) throw new Error("BoardScene: pano deposu yok");
  const events = useStore(store, (s) => s.buffer);
  return (
    <div ref={ref} className="rd-board-scene">
      {children}
      <MotionLayer rootRef={ref} state={view} events={events} speed={1} enabled={enabled} />
    </div>
  );
}
