"use client";

import type { ReactNode } from "react";
import { ScreenGuideHost } from "@/components/guide/ScreenGuideHost";
import { ConnectionBadge } from "./ConnectionBadge";
import type { OnlineState } from "./useOnline";

/**
 * 56 px üst çubuk: solda ekran adı ve "Otel · Outlet", sağda bağlantı rozeti. Bildirim çanı ve profil menüsü
 * yalnız alt çubuklu düzende buradadır; sol menülü düzende menünün üstüne taşınır (`tools` verilmez).
 */
export function StaffTopBar({
  title,
  subtitle,
  state,
  tools,
}: {
  title: string;
  subtitle: string;
  state: OnlineState;
  tools?: ReactNode;
}) {
  return (
    <header className="staff-top">
      <div className="staff-bar">
        <div className="staff-heading">
          <div className="staff-title">{title}</div>
          <span className="staff-sub">{subtitle}</span>
        </div>
        <ConnectionBadge state={state} />
        {tools}
      </div>
      <ScreenGuideHost density="personel" f1 />
    </header>
  );
}
