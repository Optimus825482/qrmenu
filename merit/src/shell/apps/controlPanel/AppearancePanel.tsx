"use client";

import { confirm } from "../../confirm";
import { AppearanceOptions } from "../../components/AppearanceOptions";
import { windowStore } from "../../windowStore";

/** Denetim Masası → Görünüm: font, wallpaper and theme; every change applies and saves at once. */
export function AppearancePanel() {
  const reset = async () => {
    const yes = await confirm({
      title: "Varsayılana dön",
      message: "Yazı boyutu, yazı tipi, duvar kağıdı ve tema varsayılan değerlerine dönsün mü?",
      danger: false,
    });
    if (yes) windowStore.getState().resetAppearance();
  };

  return (
    <>
      <h2 className="xp-cp-title">Görünüm</h2>
      <p className="xp-cp-note">Değişiklikler hemen uygulanır ve hesabınıza kaydedilir.</p>
      <AppearanceOptions variant="xp" />
      <div className="xp-cp-actions">
        <button type="button" className="xp-button" onClick={() => void reset()}>
          Varsayılana dön
        </button>
      </div>
    </>
  );
}
