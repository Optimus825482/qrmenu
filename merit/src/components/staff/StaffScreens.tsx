"use client";

import Link from "next/link";
import { createContext, useContext, useMemo, type ComponentProps, type ReactNode } from "react";
import { canViewPath } from "./backTarget";

/**
 * The screens the signed-in user may view in the hotel on screen (rbac `visibleScreens`), computed once by the kat /
 * depo layout. Pages read it to leave out links to screens the user cannot open (never a way to /yetkisiz) and to
 * pick their back target. It only shapes the view: every page and API still checks the permission itself.
 */
const VisibleScreens = createContext<ReadonlySet<string> | null>(null);

export function StaffScreensProvider({ visible, children }: { visible: readonly string[]; children: ReactNode }) {
  const key = visible.join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the joined codes are the identity of the list
  const set = useMemo(() => new Set(visible), [key]);
  return <VisibleScreens.Provider value={set}>{children}</VisibleScreens.Provider>;
}

/** The visible screens; null outside a kat / depo layout (then nothing is hidden). */
export function useVisibleScreens(): ReadonlySet<string> | null {
  return useContext(VisibleScreens);
}

/** Whether the user may view screen `code` (true outside a kat / depo layout). */
export function useCanView(code: string): boolean {
  const visible = useVisibleScreens();
  return !visible || visible.has(code);
}

/** Whether the page behind `href` opens for the user (true outside a kat / depo layout). */
export function useCanViewPath(): (href: string) => boolean {
  const visible = useVisibleScreens();
  return useMemo(() => (href: string) => !visible || canViewPath(visible, href), [visible]);
}

/** A link to another screen that is left out when the user may not view that screen. */
export function ScreenLink(props: ComponentProps<typeof Link> & { href: string }) {
  const canView = useCanViewPath();
  if (!canView(props.href)) return null;
  return <Link {...props} />;
}
