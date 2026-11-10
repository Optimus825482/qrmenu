/**
 * Service worker güncelleme izleyicisi. Sayfa zaten bir worker tarafından denetleniyorsa ve denetleyici
 * değişirse (yeni sürüm devraldı) bir kez `onUpdate` çağrılır. İlk kurulumda (denetleyici yoktu) çağrılmaz.
 */
export function watchServiceWorkerUpdate(
  container: Pick<ServiceWorkerContainer, "controller" | "addEventListener" | "removeEventListener">,
  onUpdate: () => void,
): () => void {
  const hadController = Boolean(container.controller);
  let notified = false;
  const handler = () => {
    if (!hadController || notified) return;
    notified = true;
    onUpdate();
  };
  container.addEventListener("controllerchange", handler);
  return () => container.removeEventListener("controllerchange", handler);
}
