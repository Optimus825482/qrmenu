import type { ReactNode } from "react";
import { SessionWatch } from "./SessionWatch";

/** Every /kat page: the section layouts below guard the screens; this one only watches the session. */
export default function KatLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SessionWatch />
      {children}
    </>
  );
}
