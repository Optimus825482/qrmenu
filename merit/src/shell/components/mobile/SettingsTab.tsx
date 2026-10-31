"use client";

import { LogoutButton } from "@/components/LogoutButton";
import { WALLPAPER_LABELS, WALLPAPERS, type Wallpaper } from "../../types";

type Props = {
  userName: string;
  wallpaper: Wallpaper;
  onWallpaper(w: Wallpaper): void;
  definitionsOn: boolean;
  onDefinitions(on: boolean): void;
};

/** Ayarlar: wallpaper, the "Tanımlamaları mobilde aç" switch (this session only) and sign-out. */
export function SettingsTab({ userName, wallpaper, onWallpaper, definitionsOn, onDefinitions }: Props) {
  return (
    <div className="mb-stack">
      <h2 className="mb-heading">Ayarlar</h2>
      <section className="mb-card" aria-labelledby="mb-wallpaper-label">
        <h3 className="mb-subheading" id="mb-wallpaper-label">
          Duvar kağıdı
        </h3>
        <div className="mb-wallpapers" role="radiogroup" aria-labelledby="mb-wallpaper-label">
          {WALLPAPERS.map((w) => (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={w === wallpaper}
              className="mb-wallpaper"
              data-wallpaper={w}
              onClick={() => onWallpaper(w)}
            >
              <span className="mb-wallpaper-swatch" aria-hidden="true" />
              <span>{WALLPAPER_LABELS[w]}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="mb-card">
        <div className="mb-switch-row">
          <span id="mb-defs-label" className="mb-switch-text">
            Tanımlamaları mobilde aç
            <span className="mb-hint">Yalnız bu oturum için geçerlidir.</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={definitionsOn}
            aria-labelledby="mb-defs-label"
            className="mb-switch"
            onClick={() => onDefinitions(!definitionsOn)}
          >
            <span className="mb-switch-thumb" />
          </button>
        </div>
      </section>
      <section className="mb-card">
        <p className="mb-hint">Kullanıcı: {userName}</p>
        <LogoutButton className="mb-logout" />
      </section>
    </div>
  );
}
