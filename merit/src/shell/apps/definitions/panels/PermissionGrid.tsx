"use client";

import { useMemo, useState } from "react";
import type { ModuleKey } from "@/generated/prisma/client";
import { groupScreens } from "@/modules/core/permissionGroups";

export const GRID_ACTIONS = ["V", "O", "D", "A", "R"] as const;
export type GridAction = (typeof GRID_ACTIONS)[number];
export const GRID_ACTION_TITLES: Record<GridAction, string> = {
  V: "Görüntüle",
  O: "Oluştur",
  D: "Düzenle",
  A: "Onayla",
  R: "Rapor",
};

export type GridRow = Record<GridAction, boolean> & {
  code: string;
  name: string;
  moduleKey: ModuleKey;
  /** Kişiye özel istisnalar (kullanıcı kartı): true = ek verildi, false = kısıtlandı. */
  override?: Partial<Record<GridAction, boolean>>;
};

type Props<T extends GridRow> = {
  rows: readonly T[] | null;
  disabled: boolean;
  onToggle(row: T, action: GridAction, value: boolean): void;
  /** Verilirse alan başlığında "Tümünü ver / Tümünü kaldır" düğmeleri çıkar. */
  onBulk?(group: { label: string; rows: T[] }, value: boolean): void;
  /** Açılış ekranı gibi tek bir satırı vurgular. */
  highlightCode?: string | null;
  highlightLabel?: string;
  maxHeight?: string;
};

const granted = (row: GridRow) => GRID_ACTIONS.filter((action) => row[action]).length;

/**
 * Yetki tablosu: ekranlar masaüstündeki alanlara göre gruplanır, alan başlığına tıklanınca açılıp kapanır.
 * Hem rol matrisi hem kullanıcı kartının "Yetkiler" sekmesi bu tabloyu kullanır.
 */
export function PermissionGrid<T extends GridRow>({
  rows,
  disabled,
  onToggle,
  onBulk,
  highlightCode,
  highlightLabel = "Açılış",
  maxHeight = "420px",
}: Props<T>) {
  const [search, setSearch] = useState("");
  // Kullanıcının elle açıp kapattığı alanlar; dokunulmayan alan, içinde verilmiş yetki varsa açık gelir.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const q = search.trim().toLocaleLowerCase("tr-TR");
  const groups = useMemo(() => {
    const visible = (rows ?? []).filter(
      (row) =>
        !q || row.name.toLocaleLowerCase("tr-TR").includes(q) || row.code.toLocaleLowerCase("tr-TR").includes(q),
    );
    return groupScreens(visible);
  }, [rows, q]);

  const isOpen = (id: string, groupRows: readonly T[]) =>
    q !== "" || (toggled[id] ?? groupRows.some((row) => granted(row) > 0 || row.code === highlightCode));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", minHeight: 0 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", flexWrap: "wrap" }}>
        <button
          type="button"
          className="xp-button"
          onClick={() => setToggled(Object.fromEntries(groups.map((group) => [group.id, true])))}
        >
          Alanları aç
        </button>
        <button
          type="button"
          className="xp-button"
          onClick={() => setToggled(Object.fromEntries(groups.map((group) => [group.id, false])))}
        >
          Alanları daralt
        </button>
        <input
          type="search"
          aria-label="Ekran ara"
          placeholder="Ekran ara..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ fontSize: "12px", padding: "2px 6px", width: "150px" }}
        />
      </div>

      <div
        className="xp-matrix-scroll"
        style={{
          overflow: "auto",
          border: "1px solid var(--xp-body-edge, #cbd5e1)",
          background: "var(--xp-body-light, #ffffff)",
          maxHeight,
          minHeight: "200px",
        }}
      >
        <table className="xp-matrix-grid" style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
          <thead>
            <tr style={{ background: "var(--xp-body, #e2e8f0)", position: "sticky", top: 0, zIndex: 1 }}>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Alan / ekran</th>
              {GRID_ACTIONS.map((action) => (
                <th key={action} style={{ textAlign: "center", padding: "4px 6px", width: "64px" }}>
                  {GRID_ACTION_TITLES[action]}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((group) => {
            const open = isOpen(group.id, group.screens);
            const active = group.screens.filter((row) => granted(row) > 0).length;
            return (
              <tbody key={group.id} data-testid={`perm-group-${group.id}`}>
                <tr style={{ background: "var(--xp-body, #e2e8f0)", borderTop: "1px solid var(--xp-body-edge, #cbd5e1)" }}>
                  <th colSpan={GRID_ACTIONS.length + 1} scope="rowgroup" style={{ textAlign: "left", padding: "3px 6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setToggled((current) => ({ ...current, [group.id]: !open }))}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          border: 0,
                          background: "transparent",
                          font: "inherit",
                          fontWeight: "bold",
                          color: "var(--xp-heading, #1e3a8a)",
                          cursor: "pointer",
                          padding: "3px 2px",
                        }}
                      >
                        <span aria-hidden="true" style={{ width: "10px" }}>{open ? "▾" : "▸"}</span>
                        {group.label}
                      </button>
                      <span style={{ fontWeight: "normal", color: "var(--xp-muted, #64748b)" }}>
                        {active} / {group.screens.length} ekran açık
                      </span>
                      {onBulk ? (
                        <span style={{ marginLeft: "auto", display: "inline-flex", gap: "4px" }}>
                          <button
                            type="button"
                            className="xp-button"
                            style={{ minHeight: 0, padding: "1px 8px", fontSize: "11px" }}
                            disabled={disabled}
                            onClick={() => onBulk({ label: group.label, rows: group.screens }, true)}
                          >
                            Tümünü ver
                          </button>
                          <button
                            type="button"
                            className="xp-button"
                            style={{ minHeight: 0, padding: "1px 8px", fontSize: "11px" }}
                            disabled={disabled}
                            onClick={() => onBulk({ label: group.label, rows: group.screens }, false)}
                          >
                            Tümünü kaldır
                          </button>
                        </span>
                      ) : null}
                    </div>
                  </th>
                </tr>
                {open
                  ? group.screens.map((row) => {
                      const highlighted = row.code === highlightCode;
                      return (
                        <tr
                          key={row.code}
                          style={{
                            background: highlighted ? "rgba(40, 105, 199, 0.08)" : undefined,
                            borderBottom: "1px solid var(--xp-body-edge, #e2e8f0)",
                          }}
                        >
                          <td style={{ textAlign: "left", padding: "5px 8px 5px 24px" }}>
                            <span style={{ fontWeight: highlighted ? "bold" : "normal" }}>{row.name}</span>
                            <span className="xp-matrix-name" style={{ marginLeft: "6px", fontSize: "11px" }}>
                              ({row.code})
                            </span>
                            {highlighted ? (
                              <span
                                style={{
                                  marginLeft: "6px",
                                  fontSize: "10px",
                                  padding: "1px 5px",
                                  borderRadius: "3px",
                                  background: "var(--xp-select, #316ac5)",
                                  color: "#fff",
                                  fontWeight: "bold",
                                }}
                              >
                                {highlightLabel}
                              </span>
                            ) : null}
                          </td>
                          {GRID_ACTIONS.map((action) => {
                            const own = row.override?.[action];
                            const note = own === true ? "ek verildi" : own === false ? "kısıtlandı" : "";
                            return (
                              <td
                                key={action}
                                title={note ? `Kişiye özel: ${note}` : undefined}
                                style={{
                                  textAlign: "center",
                                  padding: "4px",
                                  background:
                                    own === true
                                      ? "rgba(22, 163, 74, 0.18)"
                                      : own === false
                                        ? "rgba(220, 38, 38, 0.16)"
                                        : undefined,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  aria-label={`${row.name} · ${GRID_ACTION_TITLES[action]}${note ? ` (${note})` : ""}`}
                                  checked={row[action]}
                                  disabled={disabled}
                                  onChange={(event) => onToggle(row, action, event.target.checked)}
                                  style={{ cursor: disabled ? "default" : "pointer" }}
                                />
                                {note ? (
                                  <span aria-hidden="true" style={{ marginLeft: "3px", fontWeight: "bold" }}>
                                    {own ? "+" : "−"}
                                  </span>
                                ) : null}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  : null}
              </tbody>
            );
          })}
          {groups.length === 0 ? (
            <tbody>
              <tr>
                <td
                  colSpan={GRID_ACTIONS.length + 1}
                  style={{ textAlign: "center", padding: "16px", color: "var(--xp-muted)" }}
                >
                  {rows ? "Aramaya uygun ekran bulunamadı." : "Yetkiler yükleniyor..."}
                </td>
              </tr>
            </tbody>
          ) : null}
        </table>
      </div>
    </div>
  );
}
