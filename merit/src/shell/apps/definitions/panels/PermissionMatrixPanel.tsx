"use client";

import { useEffect, useMemo, useState } from "react";
import {
  permissionMatrixAction,
  setPermissionScreenAction,
} from "@/modules/core/server/admin/actions/permissions";
import { roleOptionsAction, updateRoleAction } from "@/modules/core/server/admin/actions/roles";
import { userOptionsAction } from "@/modules/core/server/admin/actions/users";
import { previewRoleAccessAction, type AccessPreview } from "@/modules/core/server/actions/accessPreview";
import { AccessPreviewView } from "../../AccessPreviewDialog";
import type { Flags, PermissionMatrix, ScreenCell } from "@/modules/core/server/admin/permissions";
import type { RoleOptions } from "@/modules/core/server/admin/roles";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";

type Props = { hotelId: string; setStatus(text: string): void };
const ACTIONS = ["V", "O", "D", "A", "R"] as const;
const ACTION_TITLES: Record<(typeof ACTIONS)[number], string> = {
  V: "Görüntüle",
  O: "Oluştur",
  D: "Düzenle",
  A: "Onayla",
  R: "Rapor",
};

const MODULE_LABELS: Record<string, string> = {
  ALL: "Tüm Modüller",
  MINIBAR: "Minibar Takip",
  QR_ORDER: "QR Sipariş / Outlet",
  QR_MENU: "QR Menü",
  ROOM_SERVICE: "Oda Servisi",
  CORE: "Çekirdek Sistem",
};

const FLOWS = {
  "QS-KUY": {
    title: "Outlet Garson Ekranı",
    steps: [
      ["Outlet seçimi", "Kullanıcı erişimindeki outleti seçer."],
      ["Masalar ve menü", "Seçilen outletin aktif masaları ve açık ürünleri yüklenir."],
      ["Garson siparişi", "Sipariş açıksa masadan ürün seçip adisyon kaydeder."],
      ["Çağrı ve QR", "Sipariş kapalıysa çağrıları görür; QR siparişleri aynı outlet akışına düşer."],
      ["Adisyon durumu", "Adisyon kasaya gider; garson kendi ekranından hazırlanma ve servis durumunu izler."],
    ],
    screens: ["QS-KUY", "QM-CAG"],
  },
  "QS-KAS": {
    title: "Outlet Kasa Ekranı",
    steps: [
      ["Outlet seçimi", "Kasiyer çalışacağı outleti seçer."],
      ["Masa panosu", "Masaların durumu, açık adisyonlar ve çağrılar görünür."],
      ["Sipariş kuyruğu", "Garson ve QR siparişleri bu outlette toplanır."],
      ["Onay", "Sipariş onaylanır ve KDS açıksa mutfağa gönderilir."],
      ["Fiş", "Adisyon yazdırılır; gerektiğinde yeniden yazdırılır."],
    ],
    screens: ["QS-KAS", "QS-FIS", "QS-IPT"],
  },
  "QS-KDS": {
    title: "Outlet Mutfak Ekranı",
    steps: [
      ["Onaylı sipariş", "Kasa/garson onayından geçen adisyon mutfağa gelir."],
      ["Sıralı kuyruk", "Yeni, hazırlanıyor ve hazır siparişler sırayla gösterilir."],
      ["Hazırlık", "Mutfak siparişi hazırlamaya alır ve hazır olarak işaretler."],
      ["Servis", "Garson hazır bilgisini görür; mutfak fişi yazdırılabilir."],
    ],
    screens: ["QS-KDS"],
  },
} as const;

const FLOW_FALLBACK: (typeof FLOWS)[keyof typeof FLOWS] = FLOWS["QS-KUY"];

function screensForRole(options: RoleOptions | null) {
  return options?.screens ?? [];
}

/** Rolün açılış ekranını seçer, ekran yetki matrisini yönetir ve rolün göreceği ekranları önizler. */
export function PermissionMatrixPanel({ hotelId, setStatus }: Props) {
  const [options, setOptions] = useState<RoleOptions | null>(null);
  const [roleId, setRoleId] = useState("");
  const [screenCode, setScreenCode] = useState("");
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [error, setError] = useState("");
  const [savingScreen, setSavingScreen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"ayar" | "onizleme">("ayar");
  const [hotels, setHotels] = useState<{ id: string; name: string }[]>([]);
  const [previewHotel, setPreviewHotel] = useState(hotelId);
  const [preview, setPreview] = useState<AccessPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("ALL");
  const [searchFilter, setSearchFilter] = useState<string>("");

  const role = options?.roles.find((item) => item.id === roleId);
  const currentFlow = screenCode in FLOWS ? FLOWS[screenCode as keyof typeof FLOWS] : null;
  const flow = currentFlow ?? FLOW_FALLBACK;
  const locked = role?.code === "R-SYS";

  useEffect(() => {
    let live = true;
    void roleOptionsAction().then((result) => {
      if (!live) return;
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOptions(result.data);
      const initial = result.data.roles.find((item) => item.code === "R-OTM") ?? result.data.roles[0];
      if (initial) {
        setRoleId(initial.id);
        const screenOptions = screensForRole(result.data);
        const initialScreen = screenOptions.some((screen) => screen.code === initial.defaultScreen)
          ? initial.defaultScreen ?? ""
          : screenOptions[0]?.code ?? "";
        setScreenCode(initialScreen);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!roleId) return;
    let live = true;
    void permissionMatrixAction({ roleId }).then((result) => {
      if (!live) return;
      if (result.ok) {
        setMatrix(result.data);
        setError("");
      } else {
        setError(result.error.message);
      }
    });
    return () => {
      live = false;
    };
  }, [roleId]);

  useEffect(() => {
    if (tab !== "onizleme") return;
    let live = true;
    void userOptionsAction().then((result) => {
      if (!live || !result.ok) return;
      setHotels(result.data.hotels);
      setPreviewHotel((current) => current || result.data.hotels[0]?.id || "");
    });
    return () => {
      live = false;
    };
  }, [tab]);

  useEffect(() => {
    if (tab !== "onizleme" || !roleId || !previewHotel) return;
    let live = true;
    void previewRoleAccessAction({ roleId, hotelId: previewHotel }).then((result) => {
      if (!live) return;
      if (result.ok) setPreview(result.data);
      else setPreviewError(result.error.message);
    });
    return () => {
      live = false;
    };
  }, [tab, roleId, previewHotel]);

  useEffect(() => {
    setStatus(role ? `${role.name} · açılış ve ekran yetkileri` : "Rol ve açılış ekranı seçin");
  }, [role, setStatus]);

  const chooseRole = (id: string) => {
    const next = options?.roles.find((item) => item.id === id);
    setRoleId(id);
    setPreview(null);
    setPreviewError("");
    const screenOptions = screensForRole(options);
    const nextScreen = screenOptions.some((screen) => screen.code === next?.defaultScreen)
      ? next?.defaultScreen ?? ""
      : screenOptions[0]?.code ?? "";
    setScreenCode(nextScreen);
    setMatrix(null);
  };

  const saveOpeningScreen = async () => {
    if (!role || savingScreen) return;
    const selected = options?.screens.find((item) => item.code === screenCode);
    const yes = await confirm({
      title: "Açılış ekranını kaydet",
      message: `${role.name} rolü girişte ${selected?.name ?? "varsayılan ekranda"} açılsın mı?`,
      danger: false,
    });
    if (!yes) return;
    setSavingScreen(true);
    try {
      const result = await updateRoleAction({
        id: role.id,
        data: {
          name: role.name,
          kind: role.kind,
          maxOnlineMinutes: role.maxOnlineMinutes ?? undefined,
          defaultScreen: screenCode || undefined,
        },
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOptions((current) =>
        current
          ? {
              ...current,
              roles: current.roles.map((item) =>
                item.id === result.data.id ? { ...item, defaultScreen: result.data.defaultScreen } : item,
              ),
            }
          : current,
      );
      setError("");
      notify.success(`${role.name} rolünün açılış ekranı güncellendi.`);
    } finally {
      setSavingScreen(false);
    }
  };

  const togglePermission = async (cell: ScreenCell, action: (typeof ACTIONS)[number], value: boolean) => {
    const yes = await confirm({
      title: "Ekran yetkisini güncelle",
      message: `${cell.name} için “${ACTION_TITLES[action]}” yetkisi ${value ? "açılsın" : "kapatılsın"} mı?`,
      danger: true,
      confirmLabel: "Onayla",
    });
    if (!yes) return;
    const flags: Flags = { V: cell.V, O: cell.O, D: cell.D, A: cell.A, R: cell.R, [action]: value };
    setBusy(true);
    try {
      const result = await setPermissionScreenAction({ roleId, hotelId: null, screenCode: cell.code, flags });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setMatrix((current) =>
        current
          ? {
              ...current,
              screens: current.screens.map((item) => (item.code === result.data.code ? result.data : item)),
            }
          : current,
      );
      setError("");
    } finally {
      setBusy(false);
    }
  };

  const roleSelect = (
    <label>
      Rol
      <select aria-label="Rol" value={roleId} onChange={(event) => chooseRole(event.target.value)}>
        {(options?.roles ?? []).map((item) => (
          <option key={item.id} value={item.id}>
            {item.code} — {item.name}
          </option>
        ))}
      </select>
    </label>
  );

  const matrixScreens = matrix?.screens;
  const filteredScreens = useMemo(() => {
    if (!matrixScreens) return [];
    return matrixScreens.filter((s) => {
      const matchesMod = moduleFilter === "ALL" || s.moduleKey === moduleFilter;
      const q = searchFilter.trim().toLowerCase();
      const matchesSearch = !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q);
      return matchesMod && matchesSearch;
    });
  }, [matrixScreens, moduleFilter, searchFilter]);

  return (
    <div
      className="xp-matrix xp-role-screen"
      style={{
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        overflowX: "auto",
        flex: 1,
        minHeight: 0,
        height: "100%",
        padding: "4px 8px 24px",
      }}
    >
      <div role="tablist" aria-label="Rol görünümü" className="xp-defs-filters" style={{ flexShrink: 0 }}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "ayar"}
          className={`xp-button ${tab === "ayar" ? "is-selected font-bold" : ""}`}
          onClick={() => setTab("ayar")}
        >
          Açılış ve yetkiler
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "onizleme"}
          className={`xp-button ${tab === "onizleme" ? "is-selected font-bold" : ""}`}
          onClick={() => setTab("onizleme")}
        >
          Bu rol ne görür?
        </button>
      </div>

      {tab === "onizleme" ? (
        <section
          role="tabpanel"
          aria-label="Bu rol ne görür?"
          data-testid="role-preview"
          style={{
            display: "flex",
            flexDirection: "column",
            minHeight: "min-content",
            paddingRight: "6px",
            paddingBottom: "16px",
          }}
        >
          <div className="xp-defs-filters" style={{ flexShrink: 0, marginBottom: "8px" }}>
            {roleSelect}
            <label>
              Otel
              <select
                aria-label="Otel"
                value={previewHotel}
                onChange={(event) => {
                  setPreview(null);
                  setPreviewError("");
                  setPreviewHotel(event.target.value);
                }}
              >
                {hotels.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {previewError ? <p role="alert" className="xp-defs-error">{previewError}</p> : null}
          {preview ? (
            <AccessPreviewView preview={preview} />
          ) : previewError ? null : (
            <p className="xp-defs-note">Yükleniyor...</p>
          )}
        </section>
      ) : (
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            minHeight: "min-content",
            paddingRight: "6px",
            paddingBottom: "16px",
          }}
        >
          <div className="xp-defs-filters xp-role-screen-selectors" style={{ flexShrink: 0 }}>
            {roleSelect}
            <label>
              Açılış ekranı
              <select
                aria-label="Açılış ekranı"
                value={screenCode}
                onChange={(event) => setScreenCode(event.target.value)}
              >
                <option value="">Seçilmedi</option>
                {screensForRole(options).map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name} ({item.code})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="xp-button"
              disabled={!role || !options?.canEdit || savingScreen || role.defaultScreen === (screenCode || null)}
              onClick={() => void saveOpeningScreen()}
            >
              {savingScreen ? "Kaydediliyor..." : "Açılış ekranını kaydet"}
            </button>
          </div>

          {error ? <p role="alert" className="xp-defs-error">{error}</p> : null}
          {options && !options.canEdit ? (
            <p className="xp-defs-note">Rolün açılış ekranını ve yetkilerini yalnızca sistem yöneticisi değiştirebilir.</p>
          ) : null}
          {locked ? (
            <p className="xp-defs-note" style={{ color: "var(--xp-accent, #0055ea)", fontWeight: "bold" }}>
              Sistem Yöneticisi rolünün ekran yetkileri sistem güvenliği gereği kilitlidir ve tam yetkilidir.
            </p>
          ) : null}

          {/* Akış şeması (Varsa) */}
          {currentFlow ? (
            <div className="xp-workflow" aria-label={`${flow.title} iş akışı`} style={{ flexShrink: 0 }}>
              <div className="xp-workflow-heading">
                <h2>{flow.title} İş Akışı</h2>
              </div>
              <div className="xp-workflow-track">
                {flow.steps.map(([title, description], index) => (
                  <article className="xp-workflow-step" key={title}>
                    <span className="xp-workflow-number">{index + 1}</span>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {/* Rolün Tüm Ekran Yetkileri Matrisi */}
          <div
            className="xp-matrix-all-screens"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              flex: 1,
              minHeight: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "8px",
                flexShrink: 0,
              }}
            >
              <h3 style={{ margin: 0, fontSize: "13px", fontWeight: "bold", color: "var(--xp-heading, #1e3a8a)" }}>
                {role ? `${role.name} (${role.code}) Ekran Yetkileri` : "Ekran Yetkileri"}
              </h3>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <label style={{ fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  Modül:
                  <select
                    value={moduleFilter}
                    onChange={(e) => setModuleFilter(e.target.value)}
                    style={{ fontSize: "12px", padding: "2px 6px" }}
                  >
                    <option value="ALL">Tüm Modüller ({matrix?.screens?.length ?? 0})</option>
                    <option value="MINIBAR">Minibar Takip</option>
                    <option value="QR_ORDER">QR Sipariş / Outlet</option>
                    <option value="QR_MENU">QR Menü</option>
                    <option value="ROOM_SERVICE">Oda Servisi</option>
                    <option value="CORE">Çekirdek Sistem</option>
                  </select>
                </label>

                <input
                  type="search"
                  placeholder="Ekran ara..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  style={{ fontSize: "12px", padding: "2px 6px", width: "140px" }}
                />
              </div>
            </div>

            <div
              className="xp-matrix-scroll"
              style={{
                overflowY: "auto",
                overflowX: "auto",
                border: "1px solid var(--xp-body-edge, #cbd5e1)",
                background: "var(--xp-body-light, #ffffff)",
                maxHeight: "420px",
                minHeight: "220px",
              }}
            >
              <table className="xp-matrix-grid" style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ background: "var(--xp-body, #e2e8f0)", position: "sticky", top: 0, zIndex: 1 }}>
                    <th style={{ textAlign: "left", padding: "4px 8px" }}>Ekran Adı</th>
                    <th style={{ textAlign: "left", padding: "4px 8px", width: "140px" }}>Modül</th>
                    <th style={{ textAlign: "center", padding: "4px 6px", width: "42px" }} title="Görüntüle">V</th>
                    <th style={{ textAlign: "center", padding: "4px 6px", width: "42px" }} title="Oluştur">O</th>
                    <th style={{ textAlign: "center", padding: "4px 6px", width: "42px" }} title="Düzenle">D</th>
                    <th style={{ textAlign: "center", padding: "4px 6px", width: "42px" }} title="Onayla">A</th>
                    <th style={{ textAlign: "center", padding: "4px 6px", width: "42px" }} title="Rapor">R</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredScreens.map((cell) => {
                    const isOpening = cell.code === role?.defaultScreen;
                    return (
                      <tr
                        key={cell.code}
                        style={{
                          background: isOpening ? "rgba(40, 105, 199, 0.08)" : undefined,
                          borderBottom: "1px solid var(--xp-body-edge, #e2e8f0)",
                        }}
                      >
                        <td style={{ textAlign: "left", padding: "5px 8px" }}>
                          <span style={{ fontWeight: isOpening ? "bold" : "normal" }}>{cell.name}</span>
                          <span className="xp-matrix-name" style={{ marginLeft: "6px", fontSize: "11px" }}>
                            ({cell.code})
                          </span>
                          {isOpening ? (
                            <span
                              style={{
                                marginLeft: "6px",
                                fontSize: "10px",
                                padding: "1px 5px",
                                borderRadius: "3px",
                                background: "var(--xp-accent, #0055ea)",
                                color: "#fff",
                                fontWeight: "bold",
                              }}
                            >
                              Açılış
                            </span>
                          ) : null}
                        </td>
                        <td style={{ textAlign: "left", padding: "5px 8px", color: "var(--xp-muted, #64748b)" }}>
                          {MODULE_LABELS[cell.moduleKey] ?? cell.moduleKey}
                        </td>
                        {ACTIONS.map((action) => (
                          <td key={action} style={{ textAlign: "center", padding: "4px" }}>
                            <input
                              type="checkbox"
                              aria-label={`${cell.name} · ${ACTION_TITLES[action]}`}
                              checked={cell[action]}
                              disabled={!options?.canEdit || locked || busy}
                              onChange={(event) => void togglePermission(cell, action, event.target.checked)}
                              style={{ cursor: !options?.canEdit || locked || busy ? "default" : "pointer" }}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {filteredScreens.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "16px", color: "var(--xp-muted)" }}>
                        {matrix ? "Filtreye uygun ekran bulunamadı." : "Yetkiler yükleniyor..."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div
              className="xp-action-legend"
              aria-label="Yetki harflerinin açıklaması"
              style={{ flexShrink: 0, fontSize: "11px", paddingTop: "4px" }}
            >
              {ACTIONS.map((action) => (
                <span key={action} style={{ marginRight: "12px" }}>
                  <strong>{action}</strong>: {ACTION_TITLES[action]}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
