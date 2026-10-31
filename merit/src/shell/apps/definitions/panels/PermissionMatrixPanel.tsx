"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  copyPermissionsAction,
  permissionMatrixAction,
  resetHotelOverridesAction,
  setPermissionModuleAction,
  setPermissionScreenAction,
} from "@/modules/core/server/admin/actions/permissions";
import { roleOptionsAction } from "@/modules/core/server/admin/actions/roles";
import type { Flags, PermissionMatrix, ScreenCell } from "@/modules/core/server/admin/permissions";
import type { RoleOptions } from "@/modules/core/server/admin/roles";
import { alertDialog, confirm } from "@/shell/confirm";
import { useSse } from "@/shell/useSse";
import { MODULE_LABELS } from "./values";

type Props = { hotelId: string; setStatus(text: string): void };

const ACTIONS = ["V", "O", "D", "A", "R"] as const;
const ACTION_TITLES: Record<(typeof ACTIONS)[number], string> = {
  V: "Görüntüle",
  O: "Oluştur",
  D: "Düzenle",
  A: "Onayla",
  R: "Rapor",
};
const DEFINITION_EVENTS = ["definition.changed"] as const;
const SYSTEM_SCOPE = "";

/**
 * Yetki Matrisi: screen x action grid of one role, system-wide or for one hotel. In a hotel,
 * faded cells are inherited from the system-wide rows and bold ones are hotel overrides. Each
 * click saves at once; non-SISTEM users see the grid read-only.
 */
export function PermissionMatrixPanel({ setStatus }: Props) {
  const [options, setOptions] = useState<RoleOptions | null>(null);
  const [roleId, setRoleId] = useState("");
  const [scope, setScope] = useState(SYSTEM_SCOPE);
  const [data, setData] = useState<PermissionMatrix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [copyFrom, setCopyFrom] = useState("");
  const canEdit = options?.canEdit === true;
  const hotelScope = scope || null;
  const role = options?.roles.find((r) => r.id === roleId);
  const locked = role?.code === "R-SYS";
  const editable = canEdit && !locked;

  useEffect(() => {
    let live = true;
    void roleOptionsAction().then((result) => {
      if (!live) return;
      if (result.ok) {
        setOptions(result.data);
        const initial = result.data.roles.find((r) => r.code === "R-OTM") ?? result.data.roles[0];
        setRoleId((current) => current || initial?.id || "");
      } else {
        setError(result.error.message);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!roleId) return;
    let live = true;
    void permissionMatrixAction({ roleId, hotelId: hotelScope }).then((result) => {
      if (!live) return;
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error.message);
      }
    });
    return () => {
      live = false;
    };
  }, [roleId, hotelScope, tick]);

  useEffect(() => {
    const count = data?.screens.length ?? 0;
    setStatus(`${count} ekran${editable ? "" : " (salt okunur)"}`);
  }, [data, editable, setStatus]);

  const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useSse((e) => {
    const payload = e.payload as { entity?: unknown; roleId?: unknown } | undefined;
    if (payload?.entity !== "permission" || payload.roleId !== roleId) return;
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => setTick((t) => t + 1), 300);
  }, DEFINITION_EVENTS);
  useEffect(() => () => clearTimeout(reloadTimer.current), []);

  const fail = useCallback((title: string, message: string) => void alertDialog({ title, message }), []);

  const toggleCell = async (cell: ScreenCell, action: (typeof ACTIONS)[number], value: boolean) => {
    const flags: Flags = { V: cell.V, O: cell.O, D: cell.D, A: cell.A, R: cell.R, [action]: value };
    setBusy(true);
    try {
      const result = await setPermissionScreenAction({ roleId, hotelId: hotelScope, screenCode: cell.code, flags });
      if (result.ok) setTick((t) => t + 1);
      else fail("Yetki değiştirilemedi", result.error.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleModule = async (moduleKey: string, enabled: boolean) => {
    setBusy(true);
    try {
      const result = await setPermissionModuleAction({ roleId, hotelId: hotelScope, moduleKey, enabled });
      if (result.ok) setTick((t) => t + 1);
      else fail("Modül değiştirilemedi", result.error.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!hotelScope || !role) return;
    const yes = await confirm({
      title: "Otel override'larını sıfırla",
      message: `"${role.name}" rolünün bu otele özel tüm yetki ve modül ayarları silinsin mi? Sistem geneli ayarlar geçerli olur.`,
      danger: true,
    });
    if (!yes) return;
    const result = await resetHotelOverridesAction({ roleId, hotelId: hotelScope });
    if (result.ok) setTick((t) => t + 1);
    else fail("Sıfırlanamadı", result.error.message);
  };

  const copy = async () => {
    const source = options?.roles.find((r) => r.id === copyFrom);
    if (!source || !role) return;
    const yes = await confirm({
      title: "Rolden kopyala",
      message: `"${role.name}" rolünün ${hotelScope ? "bu otele özel" : "sistem geneli"} yetkileri, "${source.name}" rolünün yetkileriyle değiştirilsin mi?`,
      danger: true,
    });
    if (!yes) return;
    const result = await copyPermissionsAction({ roleId, sourceRoleId: copyFrom, hotelId: hotelScope });
    if (result.ok) {
      setTick((t) => t + 1);
      setStatus(`${result.data.screens} ekran, ${result.data.modules} modül satırı kopyalandı`);
    } else {
      fail("Kopyalanamadı", result.error.message);
    }
  };

  return (
    <div className="xp-matrix">
      <div className="xp-defs-filters">
        <label>
          Rol
          <select aria-label="Rol" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {(options?.roles ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} — {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Kapsam
          <select aria-label="Otel" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value={SYSTEM_SCOPE}>Sistem geneli</option>
            {(options?.hotels ?? []).map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        {editable ? (
          <>
            <button type="button" className="xp-button" disabled={!hotelScope || busy} onClick={() => void reset()}>
              Otel override&apos;larını sıfırla
            </button>
            <label>
              <select aria-label="Kaynak rol" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                <option value="">Kaynak rol</option>
                {(options?.roles ?? [])
                  .filter((r) => r.id !== roleId)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} — {r.name}
                    </option>
                  ))}
              </select>
            </label>
            <button type="button" className="xp-button" disabled={!copyFrom || busy} onClick={() => void copy()}>
              Rolden kopyala
            </button>
          </>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="xp-defs-error">
          {error}
        </p>
      ) : null}
      {locked ? <p className="xp-defs-note">R-SYS rolünün yetkileri kilitlidir.</p> : null}
      {!canEdit && options ? (
        <p className="xp-defs-note">Yetki matrisini yalnızca sistem yöneticisi değiştirebilir.</p>
      ) : null}
      {data ? (
        <>
          <fieldset className="xp-group xp-matrix-modules" aria-label="Modüller">
            <legend>Modüller</legend>
            {data.modules.map((m) => (
              <label key={m.moduleKey} className="xp-module-switch" data-inherited={hotelScope ? String(m.inherited) : undefined}>
                <input
                  type="checkbox"
                  role="switch"
                  checked={m.enabled}
                  disabled={!editable || busy}
                  onChange={(e) => void toggleModule(m.moduleKey, e.target.checked)}
                />
                {MODULE_LABELS[m.moduleKey]}
              </label>
            ))}
          </fieldset>
          <div className="xp-matrix-scroll">
            <table className="xp-matrix-grid" aria-label="Yetki matrisi" data-hotel={hotelScope ? "true" : undefined}>
              <thead>
                <tr>
                  <th scope="col">Ekran</th>
                  {ACTIONS.map((a) => (
                    <th key={a} scope="col" title={ACTION_TITLES[a]}>
                      {a}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.screens.map((s) => (
                  <tr key={s.code} data-inherited={hotelScope ? String(s.inherited) : undefined}>
                    <th scope="row">
                      {s.code} <span className="xp-matrix-name">{s.name}</span>
                    </th>
                    {ACTIONS.map((a) => (
                      <td key={a}>
                        <input
                          type="checkbox"
                          aria-label={`${s.code} ${ACTION_TITLES[a]}`}
                          checked={s[a]}
                          disabled={!editable || busy}
                          onChange={(e) => void toggleCell(s, a, e.target.checked)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
