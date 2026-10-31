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

export function OnlinePlaceholder() {
  return (
    <Placeholder
      icon="online"
      text="Online Kullanıcılar — sonraki aşamada doldurulacak"
      note="Seçilen oteldeki açık oturumlar bu pencerede listelenecek."
    />
  );
}
