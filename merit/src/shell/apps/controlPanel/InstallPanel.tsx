"use client";

import { useId, useState } from "react";
import { useDemoMode } from "@/modules/radar/ui/demoPreference";
import { usePwaInstall, type InstallOutcome } from "../../usePwaInstall";
import { useAppUpdate } from "../../useAppUpdate";

// Inlined by next.config.ts (env).
const VERSION = process.env.MERIT_VERSION ?? "—";
const BUILD_DATE = process.env.MERIT_BUILD_DATE ?? "—";

const OUTCOME_TEXT: Record<InstallOutcome, string> = {
  accepted: "F&B Command Center yükleniyor; kurulunca kendi penceresinde açılır.",
  dismissed: "Yükleme iptal edildi.",
  unavailable: "Yükleme şu anda kullanılamıyor.",
};

/** Denetim Masası → Uygulama: "Uygulama olarak yükle", version and build date. */
export function InstallPanel({ setStatus }: { setStatus(text: string): void }) {
  const { canInstall, installed, isIos, promptInstall } = usePwaInstall();
  const {
    hasUpdate,
    isChecking,
    isUpdating,
    serverInfo,
    lastChecked,
    checkForUpdate,
    applyUpdate,
  } = useAppUpdate();
  const [outcome, setOutcome] = useState<InstallOutcome | null>(null);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useDemoMode();
  const id = useId();

  const handleManualCheck = async () => {
    setCheckResult("Güncellemeler denetleniyor...");
    const res = await checkForUpdate(true);
    if (res.hasUpdate) {
      setCheckResult(`Yeni bir güncelleme mevcut (v${res.info?.version ?? "yeni"})!`);
      setStatus("Yeni sistem güncellemesi hazır.");
    } else {
      setCheckResult(`Sisteminiz güncel (v${VERSION}). En son sürümdesiniz.`);
      setStatus("Sistem güncel, yeni güncelleme yok.");
    }
  };

  const install = async () => {
    const result = await promptInstall();
    setOutcome(result);
    setStatus(OUTCOME_TEXT[result]);
  };

  let note: string;
  if (installed) note = "F&B Command Center bu cihazda uygulama olarak kurulu.";
  else if (canInstall) note = "Tarayıcınız yüklemeyi onaylamanızı isteyecek.";
  else if (isIos) note = "iPhone / iPad: Safari'de Paylaş düğmesine, ardından \"Ana Ekrana Ekle\"ye dokunun.";
  else
    note =
      "Bu tarayıcı şu anda yüklemeyi sunmuyor. Chrome veya Edge ile güvenli (HTTPS) adresten açın; adres çubuğundaki yükle simgesi de kullanılabilir.";

  return (
    <>
      <h2 className="xp-cp-title">Uygulama</h2>
      <p className="xp-cp-note">
        F&amp;B Command Center&apos;ı masaüstüne veya ana ekrana ekler; tarayıcı çubukları olmadan kendi
        penceresinde açılır.
      </p>
      <section className="xp-cp-section" aria-labelledby={`${id}-install`}>
        <h3 className="xp-cp-heading" id={`${id}-install`}>
          Yükleme
        </h3>
        <div className="xp-cp-install">
          <button
            type="button"
            className="xp-button"
            disabled={!canInstall}
            aria-describedby={`${id}-note`}
            onClick={() => void install()}
          >
            Uygulama olarak yükle
          </button>
          {installed ? <span className="xp-badge is-ok">Kurulu</span> : null}
        </div>
        <p className="xp-cp-note" id={`${id}-note`}>
          {note}
        </p>
        {outcome ? <p role="status">{OUTCOME_TEXT[outcome]}</p> : null}
      </section>
      <section className="xp-cp-section" aria-labelledby={`${id}-demo`}>
        <h3 className="xp-cp-heading" id={`${id}-demo`}>
          Operasyon Radarı Demo Modu
        </h3>
        <p className="xp-cp-note">
          Operasyon Radarı ekranında sentetik demo senaryoları yürütme düğmesini (&quot;Demo Başlat&quot;) gösterir veya gizler.
        </p>
        <div style={{ marginTop: 8 }}>
          <label className="xp-cp-choice">
            <input
              type="checkbox"
              role="switch"
              checked={demoMode}
              onChange={(e) => {
                setDemoMode(e.target.checked);
                setStatus(e.target.checked ? "Operasyon Radarı Demo Modu aktif edildi." : "Operasyon Radarı Demo Modu kapatıldı.");
              }}
            />
            <span>Demo Mod (Radarda &quot;Demo Başlat&quot; düğmesi görünsün)</span>
          </label>
        </div>
      </section>
      <section className="xp-cp-section" aria-labelledby={`${id}-version`}>
        <h3 className="xp-cp-heading" id={`${id}-version`}>
          Sürüm ve Canlı Güncelleme
        </h3>
        <dl className="xp-cp-facts">
          <dt>Sürüm</dt>
          <dd>
            <strong style={{ color: "#1e3a8a" }}>v{VERSION}</strong>
          </dd>
          <dt>Derleme tarihi</dt>
          <dd>{BUILD_DATE}</dd>
          <dt>Cihaz durumu</dt>
          <dd>{installed ? "Uygulama olarak kurulu (PWA Standalone)" : "Web Tarayıcısı"}</dd>
          {lastChecked ? (
            <>
              <dt>Son denetleme</dt>
              <dd>{lastChecked.toLocaleTimeString("tr-TR")}</dd>
            </>
          ) : null}
        </dl>

        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="xp-button"
            disabled={isChecking || isUpdating}
            onClick={() => void handleManualCheck()}
          >
            {isChecking ? "Denetleniyor..." : "Güncellemeleri Denetle"}
          </button>

          {hasUpdate ? (
            <button
              type="button"
              className="xp-button"
              style={{
                background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
                color: "#ffffff",
                fontWeight: "bold",
              }}
              disabled={isUpdating}
              onClick={() => void applyUpdate()}
            >
              {isUpdating ? "Güncelleniyor..." : `Şimdi Güncelle (v${serverInfo?.version ?? "yeni"})`}
            </button>
          ) : null}
        </div>

        {checkResult ? (
          <p
            className="xp-cp-note"
            style={{
              marginTop: 8,
              fontWeight: 600,
              color: hasUpdate ? "#b45309" : "#15803d",
            }}
          >
            {checkResult}
          </p>
        ) : null}
      </section>
    </>
  );
}
