"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Action } from "@/lib/rbac";

export type GuideContextValue = {
  /** Screen code → allowed actions for the session's role and hotel. */
  actionsByScreen: Record<string, Action[]>;
  /** Screen code → tour version already seen. */
  seen: Record<string, number>;
  /** The access summary was acknowledged (tours may start). */
  welcomeOk: boolean;
};

const EMPTY: GuideContextValue = { actionsByScreen: {}, seen: {}, welcomeOk: false };
const Ctx = createContext<GuideContextValue>(EMPTY);

/** Carries guide data from a server layout to client components (tour and help hooks, task 12). */
export function GuideProvider({ value, children }: { value: GuideContextValue; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGuide(): GuideContextValue {
  return useContext(Ctx);
}
