"use client";

import { useEffect, useState } from "react";
import {
  resetUserPermissionsAction,
  setUserScreenPermissionAction,
  userPermissionMatrixAction,
} from "@/modules/core/server/admin/actions/permissions";
import type { UserPermissionMatrix, UserScreenCell } from "@/modules/core/server/admin/permissions";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { GRID_ACTION_TITLES, type GridAction, PermissionGrid } from "./PermissionGrid";

type Props = { userId: string };

/**
 * Kullanıcı kartının "Yetkiler" sekmesi: rolün verdiği yetkiler ve bu kişiye özel istisnalar.
 * Her değişiklik onaydan sonra hemen kaydedilir (kartın "Kaydet" düğmesini beklemez).
 */
export function UserPermissionsTab({ userId }: Props) {
  const [matrix, setMatrix] = useState<UserPermissionMatrix | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void userPermissionMatrixAction({ userId }).then((result) => {
      if (!live) return;
      if (result.ok) setMatrix(result.data);
      else setError(result.error.message);
    });
    return () => {
      live = false;
    };
  }, [userId]);

  const overrideCount = (matrix?.screens ?? []).reduce((sum, cell) => sum + Object.keys(cell.override).length, 0);

  const toggle = async (cell: UserScreenCell, action: GridAction, value: boolean) => {
    if (!matrix) return;
    const backToRole = cell.role[action] === value;
    const yes = await confirm({
      title: "Kişiye özel yetki",
      message: backToRole
        ? `${cell.name} · “${GRID_ACTION_TITLES[action]}” yeniden rolden (${matrix.user.roleName}) gelsin mi?`
        : `${matrix.user.fullName} için ${cell.name} · “${GRID_ACTION_TITLES[action]}” yetkisi ${
            value ? "role ek olarak verilsin" : "rolde olmasına rağmen kısıtlansın"
          } mi?`,
      danger: true,
      confirmLabel: "Onayla",
    });
    if (!yes) return;
    setBusy(true);
    try {
      const result = await setUserScreenPermissionAction({ userId, screenCode: cell.code, action, value });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setMatrix((current) =>
        current
          ? { ...current, screens: current.screens.map((item) => (item.code === result.data.code ? result.data : item)) }
          : current,
      );
      setError("");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!matrix) return;
    const yes = await confirm({
      title: "Role döndür",
      message: `${matrix.user.fullName} için ${overrideCount} kişiye özel yetki silinsin ve kullanıcı yalnızca “${matrix.user.roleName}” rolünün yetkilerini kullansın mı?`,
      danger: true,
      confirmLabel: "Role döndür",
    });
    if (!yes) return;
    setBusy(true);
    try {
      const result = await resetUserPermissionsAction({ userId });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setMatrix((current) =>
        current
          ? { ...current, screens: current.screens.map((cell) => ({ ...cell, ...cell.role, override: {} })) }
          : current,
      );
      setError("");
      notify.success(`${matrix.user.fullName} yeniden rolünün yetkilerini kullanıyor.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-testid="user-permissions" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {error ? <p role="alert" className="xp-defs-error">{error}</p> : null}
      {matrix ? (
        <>
          <p className="xp-defs-note" style={{ margin: 0 }}>
            Rol: <strong>{matrix.user.roleName}</strong> ({matrix.user.roleCode}). Kutular bu kişinin şu anki
            yetkisini gösterir; yeşil <strong>+</strong> role ek verilen, kırmızı <strong>−</strong> rolde olduğu
            hâlde kısıtlanan yetkidir. Değişiklikler onaylandığı anda kaydedilir.
          </p>
          {matrix.lockReason ? <p className="xp-defs-note" style={{ margin: 0, fontWeight: "bold" }}>{matrix.lockReason}.</p> : null}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span data-testid="user-permissions-count">
              {overrideCount === 0 ? "Kişiye özel yetki yok; rolünü izliyor." : `${overrideCount} kişiye özel yetki var.`}
            </span>
            <button
              type="button"
              className="xp-button"
              disabled={!matrix.canEdit || busy || overrideCount === 0}
              onClick={() => void reset()}
            >
              Role döndür
            </button>
          </div>
          <PermissionGrid
            rows={matrix.screens}
            disabled={!matrix.canEdit || busy}
            onToggle={(cell, action, value) => void toggle(cell, action, value)}
            maxHeight="340px"
          />
        </>
      ) : error ? null : (
        <p className="xp-defs-note">Yetkiler yükleniyor...</p>
      )}
    </section>
  );
}
