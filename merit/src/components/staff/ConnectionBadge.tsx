import { Icon, type IconName } from "@/components/icons/Icon";
import type { OnlineState } from "./useOnline";

const STATES: Record<OnlineState, { text: string; icon: IconName }> = {
  online: { text: "Canlı", icon: "wifi" },
  connecting: { text: "Bağlanıyor", icon: "refresh" },
  offline: { text: "Çevrimdışı", icon: "wifi-off" },
};

/** Bağlantı durumu: renk + kenar biçimi + ikon + metin (renk tek başına anlam taşımaz). */
export function ConnectionBadge({ state }: { state: OnlineState }) {
  const { text, icon } = STATES[state];
  return (
    <span className="staff-conn" data-state={state} role="status" aria-label={`Bağlantı: ${text}`}>
      <Icon name={icon} size={16} />
      <span className="staff-conn-text">{text}</span>
    </span>
  );
}
