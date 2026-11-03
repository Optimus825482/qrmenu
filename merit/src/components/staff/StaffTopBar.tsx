"use client";

import type { ReactNode } from "react";
import { ConnectionBadge } from "./ConnectionBadge";
import type { OnlineState } from "./useOnline";

/** 56 px üst çubuk: solda ekran adı ve "Otel · Outlet", sağda bağlantı rozeti, bildirim çanı ve profil menüsü. */
export function StaffTopBar({
  title,
  subtitle,
  state,
  bell,
  profile,
}: {
  title: string;
  subtitle: string;
  state: OnlineState;
  bell: ReactNode;
  profile: ReactNode;
}) {
  return (
    <header className="staff-top">
      <div className="staff-bar">
        <div className="staff-heading">
          <div className="staff-title">{title}</div>
          <span className="staff-sub">{subtitle}</span>
        </div>
        <ConnectionBadge state={state} />
        {bell}
        {profile}
      </div>
    </header>
  );
}
