"use client";

import { useId, useState } from "react";
import { usePwaInstall, type InstallOutcome } from "../../usePwaInstall";

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
  const [outcome, setOutcome] = useState<InstallOutcome | null>(null);
  const id = useId();

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
      <section className="xp-cp-section" aria-labelledby={`${id}-version`}>
        <h3 className="xp-cp-heading" id={`${id}-version`}>
          Sürüm bilgisi
        </h3>
        <dl className="xp-cp-facts">
          <dt>Sürüm</dt>
          <dd>{VERSION}</dd>
          <dt>Derleme tarihi</dt>
          <dd>{BUILD_DATE}</dd>
        </dl>
      </section>
    </>
  );
}
