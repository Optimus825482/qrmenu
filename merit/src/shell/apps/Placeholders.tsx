"use client";

import { XpIcon } from "../icons";

/** Stand-ins so the P0 desktop is not empty; later tasks register the real components. */
function Placeholder({ icon, text, note }: { icon: string; text: string; note: string }) {
  return (
    <div className="xp-app-placeholder">
      <XpIcon name={icon} size={48} />
      <div>
        <strong>{text}</strong>
        <p>{note}</p>
      </div>
    </div>
  );
}

export function KomutaPlaceholder() {
  return (
    <Placeholder
      icon="komuta"
      text="Komuta Merkezi — P0 Task 12'de doldurulacak"
      note="Canlı KPI kartları ve olay akışı bu pencerede yer alacak."
    />
  );
}

export function AyarlarPlaceholder() {
  return (
    <Placeholder
      icon="ayarlar"
      text="Sistem Ayarları — sonraki aşamada doldurulacak"
      note="Otel ve sistem kapsamlı ayarlar bu pencerede düzenlenecek."
    />
  );
}

export function OnlinePlaceholder() {
  return (
    <Placeholder
      icon="online"
      text="Online Kullanıcılar — sonraki aşamada doldurulacak"
      note="Seçilen oteldeki açık oturumlar bu pencerede listelenecek."
    />
  );
}
