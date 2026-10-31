"use client";

import { LogoutButton } from "@/components/LogoutButton";
import { AppearanceOptions } from "../AppearanceOptions";

type Props = {
  userName: string;
  definitionsOn: boolean;
  onDefinitions(on: boolean): void;
};

/**
 * Ayarlar: the appearance options of Denetim Masası (yazı boyutu, yazı tipi, duvar kağıdı, tema),
 * the "Tanımlamaları mobilde aç" switch (this session only) and sign-out.
 */
export function SettingsTab({ userName, definitionsOn, onDefinitions }: Props) {
  return (
    <div className="mb-stack">
      <h2 className="mb-heading">Ayarlar</h2>
      <AppearanceOptions variant="mobile" />
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
