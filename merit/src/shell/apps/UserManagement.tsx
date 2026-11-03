"use client";

import type { AppProps } from "@/shell/registry";
import { useState } from "react";
import { UsersPanel } from "./definitions/panels/UsersPanel";
import { RolesPanel } from "./definitions/panels/RolesPanel";
import { PermissionMatrixPanel } from "./definitions/panels/PermissionMatrixPanel";

const PANELS = [
  { id: "users", label: "Kullanıcılar" },
  { id: "roles", label: "Roller" },
  { id: "permissions", label: "Yetki Matrisi" },
] as const;

/** Kullanıcı, rol ve erişim yönetimi tek modülde; panel aksiyonları mevcut sunucu izinlerini kullanır. */
export function UserManagement({ hotelId, initialPanel, setStatus }: AppProps) {
  const [panel, setPanel] = useState(() => PANELS.some((item) => item.id === initialPanel) ? initialPanel! : "users");
  const selected = PANELS.find((item) => item.id === panel) ?? PANELS[0];

  return (
    <div className="xp-defs">
      <div className="xp-defs-content">
        <nav className="xp-defs-nav" aria-label="Kullanıcı yönetimi">
          <div role="tree" aria-label="Kullanıcı yönetimi bölümleri" className="xp-tree" data-guide="rol-yetki">
            {PANELS.map((item) => (
              <div
                key={item.id}
                role="treeitem"
                aria-level={1}
                aria-selected={item.id === selected.id}
                tabIndex={item.id === selected.id ? 0 : -1}
                className="xp-tree-item"
                data-level={1}
                onClick={() => setPanel(item.id)}
              >
                {item.label}
              </div>
            ))}
          </div>
        </nav>
        <div className="xp-defs-main" data-guide="kullanici-listesi" role="region" aria-label={`${selected.label} paneli`}>
          {selected.id === "users" ? <UsersPanel hotelId={hotelId} setStatus={setStatus} /> : null}
          {selected.id === "roles" ? <RolesPanel hotelId={hotelId ?? ""} setStatus={setStatus} /> : null}
          {selected.id === "permissions" ? <PermissionMatrixPanel hotelId={hotelId ?? ""} setStatus={setStatus} /> : null}
        </div>
      </div>
    </div>
  );
}
