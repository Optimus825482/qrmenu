/**
 * Olay anında tek 600 ms nabız (`.pulse-once`, globals.css). `prefers-reduced-motion` ile CSS tarafında kapanır.
 * Sürekli bounce/ping/pulse animasyonlarının yerine geçer; kalıcı durum ayrıca renk + kenar + metinle gösterilir.
 */
export function pulseOnce(el: HTMLElement | null): void {
  if (!el) return;
  el.classList.remove("pulse-once");
  // Yeniden akış: aynı öğede art arda gelen olaylar nabzı yeniden başlatır.
  void el.offsetWidth;
  el.classList.add("pulse-once");
  el.addEventListener("animationend", () => el.classList.remove("pulse-once"), { once: true });
}
