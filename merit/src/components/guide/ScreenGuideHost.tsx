"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { notify } from "@/shell/notify";
import { CoachMarks } from "./CoachMarks";
import { GUIDE_EVENT, type GuideRequest } from "./guideEvents";
import { HelpSheet } from "./HelpSheet";
import { screenCodeForLocation } from "./screenForLocation";
import { useScreenTour } from "./useScreenTour";

export type ScreenGuideHostProps = {
  /** Screen code; derived from the URL when omitted (staff and POS pages). */
  code?: string;
  density: "xp" | "personel" | "pos";
  /**
   * Element that scopes the host (an XP window): targets are searched inside it and "?" / F1 requests
   * are heard on it. Without it the host serves the whole page and listens on `window`.
   */
  scopeRef?: RefObject<HTMLElement | null>;
  /** Start the tour by itself on the first visit (an XP window passes whether it is the active one). */
  autoStart?: boolean;
  /** Hotel of the XP window; guide data and help are computed for it. */
  hotelId?: string;
  /** F1 anywhere on the page opens the help (page-level hosts only; XP windows handle F1 themselves). */
  f1?: boolean;
};

/**
 * Tour and help of the current screen: mounts the coach marks overlay and the help sheet, and listens
 * for `merit:guide` requests ("?" buttons, Yardım menus, F1).
 */
export function ScreenGuideHost({ code: fixedCode, ...props }: ScreenGuideHostProps) {
  const pathname = usePathname();
  const search = useSearchParams();
  const searchText = search.toString();
  const code = useMemo(
    () => fixedCode ?? screenCodeForLocation(pathname, searchText),
    [fixedCode, pathname, searchText],
  );
  return <ScreenGuide key={JSON.stringify([code, props.hotelId])} {...props} code={code} />;
}

function ScreenGuide({ code, density, scopeRef, autoStart = true, hotelId, f1 = false }: ScreenGuideHostProps) {
  const tour = useScreenTour(code, { getRoot: () => scopeRef?.current ?? null, autoStart, hotelId });
  const [helpOpen, setHelpOpen] = useState(false);
  const startRef = useRef(tour.start);
  const replayTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    startRef.current = tour.start;
  });

  const replay = useCallback(() => {
    setHelpOpen(false);
    window.clearTimeout(replayTimer.current);
    replayTimer.current = window.setTimeout(() => {
      if (!startRef.current()) notify.info("Bu ekranda gösterilecek adım yok.");
    }, 0);
  }, []);
  useEffect(() => () => window.clearTimeout(replayTimer.current), []);

  useEffect(() => {
    const target: EventTarget = scopeRef?.current ?? window;
    const onRequest = (event: Event) => {
      const type = (event as CustomEvent<{ type: GuideRequest }>).detail?.type;
      if (type === "help") setHelpOpen(true);
      else if (type === "tour") replay();
    };
    target.addEventListener(GUIDE_EVENT, onRequest);
    return () => target.removeEventListener(GUIDE_EVENT, onRequest);
  }, [scopeRef, replay]);

  useEffect(() => {
    if (!f1) return;
    const onKey = (event: KeyboardEvent) => {
      // A window (XP) that already handled F1 has called preventDefault.
      if (event.key !== "F1" || event.defaultPrevented) return;
      event.preventDefault();
      setHelpOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [f1]);

  return (
    <>
      {tour.active ? <CoachMarks steps={tour.steps} onFinish={tour.finish} density={density} /> : null}
      {code ? (
        <HelpSheet
          code={code}
          hotelId={hotelId}
          open={helpOpen}
          onClose={() => setHelpOpen(false)}
          onReplay={replay}
          variant={density === "xp" ? "side" : "bottom"}
        />
      ) : null}
    </>
  );
}
