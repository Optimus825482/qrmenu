"use client";

import { useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/icons/Icon";
import { DEVICE_EVENT, readDeviceRaw, writeDevice } from "@/shell/deviceRecord";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(DEVICE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(DEVICE_EVENT, onChange);
  };
}

/**
 * Kasa/KDS cihaz kurulumu önerisi (spec 4.3): cihaz kaydı yokken bir kez gösterilir. "Kur" kaydı yazar
 * ve aynı kullanıcı hareketinde tam ekran, ses ve uyku kilidini ister (`start`); "Bu cihaz kasa değil"
 * kaydı `personel` olarak yazar, öneri bir daha çıkmaz. Yalnız dokunmatik tablette (>= 600 px) gösterilir. Kayıt yalnız kabuk tercihidir, yetki vermez.
 * Depo yazılamazsa (gizli pencere) öneri bu oturum için kapanır ve cihaz varsayılan kabukla çalışır.
 */
const noSubscription = () => () => {};
/** A touch device wide enough for the POS shell: a tablet. A desktop browser never gets the offer. */
const isTablet = () => navigator.maxTouchPoints > 0 && window.innerWidth >= 600;

export function DeviceSetupPrompt({ outletId, start }: { outletId?: string; start: () => Promise<void> }) {
  const stored = useSyncExternalStore(subscribe, readDeviceRaw, () => "x");
  const tablet = useSyncExternalStore(noSubscription, isTablet, () => false);
  const [closed, setClosed] = useState(false);
  if (stored !== "" || closed || !tablet) return null;

  const setup = async () => {
    setClosed(!writeDevice({ shell: "pos", outletId, kiosk: true }));
    await start();
  };
  const notPos = () => {
    writeDevice({ shell: "personel" });
    setClosed(true);
  };

  return (
    <section className="pos-gate" aria-label="Cihaz kurulumu">
      <p className="min-w-0 flex-1 text-base font-semibold">
        Bu cihazı kasa ekranı olarak kurun. Tam ekran açılır, ekran kararmaz, sipariş sesleri çalar.
      </p>
      <button type="button" className="pos-btn" data-primary onClick={() => void setup()}>
        <Icon name="fullscreen" size={24} />
        Kur
      </button>
      <button type="button" className="pos-btn" onClick={notPos}>
        Bu cihaz kasa değil
      </button>
    </section>
  );
}
