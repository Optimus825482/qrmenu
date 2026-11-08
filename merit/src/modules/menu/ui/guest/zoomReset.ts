/**
 * Detects if the mobile viewport is zoomed in (pinch-to-zoom).
 * If zoomed in, it resets scale back to 1.0 (zoom out) smoothly,
 * centers horizontal scroll, and then executes the callback (e.g. opens the dialog in the center).
 */
export function resetMobileZoomAndOpen(callback: () => void): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    callback();
    return;
  }

  // 1. Detect if the visual viewport is currently zoomed in (pinch-to-zoom)
  const isZoomed =
    window.visualViewport !== undefined &&
    window.visualViewport !== null &&
    window.visualViewport.scale > 1.02;

  if (isZoomed) {
    const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (viewportMeta) {
      const originalContent = viewportMeta.content;

      // Force mobile browser to smoothly zoom out back to 1.0
      viewportMeta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";

      // Reset any horizontal pan offset caused by pinching
      if (window.scrollX !== 0 || (window.visualViewport && window.visualViewport.pageLeft !== 0)) {
        window.scrollTo({ left: 0, top: window.scrollY, behavior: "instant" });
      }

      // Restore pinch-to-zoom capability and open the dialog centered
      setTimeout(() => {
        viewportMeta.content =
          originalContent || "width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover";
        callback();
      }, 100);
      return;
    }
  }

  // If not zoomed, open immediately
  callback();
}
