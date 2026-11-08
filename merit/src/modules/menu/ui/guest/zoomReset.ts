/**
 * Detects if the mobile viewport is zoomed in (pinch-to-zoom).
 * If zoomed in, it resets scale back to 1.0 (zoom out) smoothly,
 * centers horizontal scroll, and keeps pinch-to-zoom fully active (never locks zoom).
 */
export function resetMobileZoomAndOpen(callback: () => void): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    callback();
    return;
  }

  // Detect if the visual viewport is currently zoomed in (pinch-to-zoom)
  const isZoomed =
    window.visualViewport !== undefined &&
    window.visualViewport !== null &&
    window.visualViewport.scale > 1.02;

  if (isZoomed) {
    const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (viewportMeta) {
      // Smoothly re-trigger viewport scale to 1.0, keeping full user scalability intact
      viewportMeta.setAttribute(
        "content",
        "width=device-width, initial-scale=1.0, minimum-scale=0.25, maximum-scale=5.0, viewport-fit=cover"
      );

      // Reset any horizontal pan offset caused by pinching
      if (window.scrollX !== 0 || (window.visualViewport && window.visualViewport.pageLeft !== 0)) {
        window.scrollTo({ left: 0, top: window.scrollY, behavior: "instant" });
      }

      callback();
      return;
    }
  }

  // If not zoomed, open immediately
  callback();
}
