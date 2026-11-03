"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Density } from "./tap";

const DensityContext = createContext<Density>("personel");

/** Scopes `data-density` (see globals.css) and exposes it to descendants. */
export function DensityRoot({ density, children }: { density: Density; children: ReactNode }) {
  return (
    <DensityContext.Provider value={density}>
      <div data-density={density} style={{ display: "contents" }}>
        {children}
      </div>
    </DensityContext.Provider>
  );
}

export function useDensity(): Density {
  return useContext(DensityContext);
}
