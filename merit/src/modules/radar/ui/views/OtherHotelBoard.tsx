"use client";

import type { ReactNode } from "react";
import type { RadarState } from "../../state";
import type { RadarLayer } from "../../types";
import { RadarStoreContext, useRadar } from "../useRadar";

/**
 * The live board of a hotel other than the window's. It has its own store, so it keeps up with events like the
 * main one, but a light one: the snapshot carries `layers` only and no overview is loaded. Events arrive over the
 * window's single stream. `layers` must be a constant.
 */
export function OtherHotelBoard({
  hotelId,
  layers,
  children,
}: {
  hotelId: string;
  layers: readonly RadarLayer[];
  children: (view: RadarState) => ReactNode;
}) {
  const { store, state } = useRadar(hotelId, layers);
  const view = state.hotelId === hotelId ? state.view : null;
  if (!view) {
    if (state.connection !== "offline") return <p className="rd-muted rd-small">Yükleniyor…</p>;
    return (
      <p className="rd-muted rd-small" role="status">
        Bu otelin panosu yüklenemedi; bir dakika içinde yeniden denenecek.{" "}
        <button type="button" className="rd-link" onClick={() => void store.getState().refresh()}>
          Şimdi dene
        </button>
      </p>
    );
  }
  return <RadarStoreContext.Provider value={store}>{children(view)}</RadarStoreContext.Provider>;
}
