/**
 * Brand mark on the wallpaper (Denetim Masası → Marka → "Duvar kağıdı filigranı"): title, rule and
 * subtitle only; the copyright credit lives in the footer band. Decoration only: hidden from
 * assistive tech and transparent to the pointer. Colors: theme.css.
 */
export function BrandWatermark() {
  return (
    <div className="xp-brand-watermark" aria-hidden="true">
      <div className="xp-brand-title">MERIT ROYAL</div>
      <div className="xp-brand-rule" />
      <div className="xp-brand-subtitle">F&amp;B OPERATION COMMAND CENTER</div>
    </div>
  );
}
