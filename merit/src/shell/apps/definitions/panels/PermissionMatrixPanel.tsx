"use client";

import { useEffect, useState } from "react";
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

const ROLE_SCREEN_CODES: Record<string, readonly string[]> = {
  "R-GAR": ["QS-KUY"],
  "R-BAR": ["QS-KUY"],
  "R-BUT": ["QS-KUY"],
  "R-SGF": ["QS-KUY"],
  "R-KAS": ["QS-KAS"],
  "R-KDS": ["QS-KDS"],
  "R-MUS": ["QS-KDS"],
  "R-MUP": ["QS-KDS"],
};

function screensForRole(options: RoleOptions | null, roleCode?: string) {
  const screens = options?.screens ?? [];
  const allowed = roleCode ? ROLE_SCREEN_CODES[roleCode] : undefined;
  return allowed ? screens.filter((screen) => allowed.includes(screen.code)) : screens;
}

/** Rolün açılış ekranını seçer; QR operasyon ekranlarında akış ve ekran izinlerini de gösterir. */
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
        const screenOptions = screensForRole(result.data, initial.code);
        const initialScreen = screenOptions.some((screen) => screen.code === initial.defaultScreen)
          ? initial.defaultScreen ?? ""
          : screenOptions[0]?.code ?? "";
        setScreenCode(initialScreen);
      }
    });
    return () => { live = false; };
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
    return () => { live = false; };
  }, [roleId]);

  useEffect(() => {
    if (tab !== "onizleme") return;
    let live = true;
    void userOptionsAction().then((result) => {
      if (!live || !result.ok) return;
      setHotels(result.data.hotels);
      setPreviewHotel((current) => current || result.data.hotels[0]?.id || "");
    });
    return () => { live = false; };
  }, [tab]);

  useEffect(() => {
    if (tab !== "onizleme" || !roleId || !previewHotel) return;
    let live = true;
    void previewRoleAccessAction({ roleId, hotelId: previewHotel }).then((result) => {
      if (!live) return;
      if (result.ok) setPreview(result.data);
      else setPreviewError(result.error.message);
    });
    return () => { live = false; };
  }, [tab, roleId, previewHotel]);

  useEffect(() => {
    setStatus(role ? `${role.name} · açılış ekranı` : "Rol ve açılış ekranı seçin");
  }, [role, setStatus]);

  const chooseRole = (id: string) => {
    const next = options?.roles.find((item) => item.id === id);
    setRoleId(id);
    setPreview(null);
    setPreviewError("");
    const screenOptions = screensForRole(options, next?.code);
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
      setOptions((current) => current ? {
        ...current,
        roles: current.roles.map((item) => item.id === result.data.id
          ? { ...item, defaultScreen: result.data.defaultScreen }
          : item),
      } : current);
      setError("");
      notify.success(`${role.name} rolünün açılış ekranı güncellendi.`);
    } finally {
      setSavingScreen(false);
    }
  };

  const togglePermission = async (cell: ScreenCell, action: (typeof ACTIONS)[number], value: boolean) => {
    const yes = await confirm({ title: "Ekran yetkisini güncelle", message: `${cell.name} için “${ACTION_TITLES[action]}” yetkisi ${value ? "açılsın" : "kapatılsın"} mı?`, danger: true, confirmLabel: "Onayla" });
    if (!yes) return;
    const flags: Flags = { V: cell.V, O: cell.O, D: cell.D, A: cell.A, R: cell.R, [action]: value };
    setBusy(true);
    try {
      const result = await setPermissionScreenAction({ roleId, hotelId: null, screenCode: cell.code, flags });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setMatrix((current) => current ? {
        ...current,
        screens: current.screens.map((item) => item.code === result.data.code ? result.data : item),
      } : current);
      setError("");
    } finally {
      setBusy(false);
    }
  };

  const roleSelect = (
    <label>Rol
      <select aria-label="Rol" value={roleId} onChange={(event) => chooseRole(event.target.value)}>
        {(options?.roles ?? []).map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
      </select>
    </label>
  );

  return (
    <div className="xp-matrix xp-role-screen">
      <div role="tablist" aria-label="Rol görünümü" className="xp-defs-filters">
        <button type="button" role="tab" aria-selected={tab === "ayar"} className="xp-button" onClick={() => setTab("ayar")}>
          Açılış ve yetkiler
        </button>
        <button type="button" role="tab" aria-selected={tab === "onizleme"} className="xp-button" onClick={() => setTab("onizleme")}>
          Bu rol ne görür?
        </button>
      </div>
      {tab === "onizleme" ? (
        <section role="tabpanel" aria-label="Bu rol ne görür?" data-testid="role-preview">
          <div className="xp-defs-filters">
            {roleSelect}
            <label>Otel
              <select aria-label="Otel" value={previewHotel} onChange={(event) => { setPreview(null); setPreviewError(""); setPreviewHotel(event.target.value); }}>
                {hotels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>
          {previewError ? <p role="alert" className="xp-defs-error">{previewError}</p> : null}
          {preview ? <AccessPreviewView preview={preview} /> : previewError ? null : <p className="xp-defs-note">Yükleniyor...</p>}
        </section>
      ) : (
    <>
      <div className="xp-defs-filters xp-role-screen-selectors">
        {roleSelect}
        <label>Açılış ekranı
          <select aria-label="Açılış ekranı" value={screenCode} onChange={(event) => setScreenCode(event.target.value)}>
            <option value="">Seçilmedi</option>
            {screensForRole(options, role?.code).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
        </label>
        <button type="button" className="xp-button" disabled={!role || !options?.canEdit || savingScreen || role.defaultScreen === (screenCode || null)} onClick={() => void saveOpeningScreen()}>
          Açılış ekranını kaydet
        </button>
      </div>

      {error ? <p role="alert" className="xp-defs-error">{error}</p> : null}
      {options && !options.canEdit ? <p className="xp-defs-note">Rolün açılış ekranını yalnızca sistem yöneticisi değiştirebilir.</p> : null}
      {locked ? <p className="xp-defs-note">Sistem Yöneticisi rolünün ekran yetkileri kilitlidir.</p> : null}

      {currentFlow ? (
        <section className="xp-workflow" aria-label={`${flow.title} iş akışı`}>
          <h2>{flow.title} iş akışı</h2>
          <div className="xp-workflow-track">
            {flow.steps.map(([title, description], index) => (
              <article className="xp-workflow-step" key={title}>
                <span className="xp-workflow-number">{index + 1}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
          <div className="xp-workflow-permissions">
            {flow.screens.map((code) => {
              const cell = matrix?.screens.find((item) => item.code === code);
              if (!cell) return null;
              return (
                <fieldset className="xp-workflow-access" key={code} disabled={!options?.canEdit || locked || busy}>
                  <legend>{cell.name}</legend>
                  <div className="xp-workflow-actions">
                    {ACTIONS.map((action) => (
                      <label key={action} title={ACTION_TITLES[action]}>
                        <input type="checkbox" aria-label={`${cell.name} · ${ACTION_TITLES[action]}`} checked={cell[action]} onChange={(event) => void togglePermission(cell, action, event.target.checked)} />
                        {action}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
          <div className="xp-action-legend" aria-label="Yetki harflerinin açıklaması">
            {ACTIONS.map((action) => <span key={action}><strong>{action}</strong> {ACTION_TITLES[action]}</span>)}
          </div>
        </section>
      ) : screenCode ? (
        <p className="xp-defs-note">Seçilen ekran için açılış hedefi kaydedilir. QR sipariş ekranlarında iş akışı ve ekran yetkileri ayrıca gösterilir.</p>
      ) : null}
    </>
      )}
    </div>
  );
}
