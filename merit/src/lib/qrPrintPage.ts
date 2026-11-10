/** Printable QR card sheet (HTML, opened in a new tab): shared by the table QR and room QR print pages. */

export type QrPrintTemplate = "stand" | "compact" | "badge";
export type QrPrintTheme = "royal" | "classic" | "dark";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Texts are escaped here, except `svg`, `caption` and the `cta*` lines, which are trusted markup of the caller. */
export type QrPrintCardData = {
  hotel: string;
  /** Outlet name (tables) or a fixed service line (rooms). */
  title: string;
  /** Area (tables) or floor (rooms). */
  pill: string;
  /** Small line above the label on the stand card, e.g. `MASA &bull; TABLE`. */
  caption: string;
  /** Table label or room number, printed large. */
  label: string;
  svg: string;
  ctaTr: string;
  ctaEn: string;
  ctaShortTr: string;
  ctaShortEn: string;
  ctaBadge: string;
};

export function qrPrintCard(template: QrPrintTemplate, theme: QrPrintTheme, c: QrPrintCardData): string {
  if (template === "compact") {
    return `<div class="card" data-template="compact" data-theme="${theme}">
          <div class="compact-left">${c.svg}</div>
          <div class="compact-right">
            <div class="hotel-title">${esc(c.hotel)}</div>
            <div class="outlet-title">${esc(c.title)}</div>
            <div class="area-pill">${esc(c.pill)}</div>
            <div class="table-badge"><span class="label">${esc(c.label)}</span></div>
            <div class="cta-tr">${c.ctaShortTr}</div>
            <div class="cta-en">${c.ctaShortEn}</div>
          </div>
        </div>`;
  }
  if (template === "badge") {
    return `<div class="card" data-template="badge" data-theme="${theme}">
          <div class="hotel-title">${esc(c.hotel)}</div>
          <div class="outlet-title">${esc(c.title)}</div>
          <div class="badge-qr">${c.svg}</div>
          <div class="table-badge"><span class="label">${esc(c.label)}</span></div>
          <div class="cta-tr">${esc(c.pill)} &bull; ${c.ctaBadge}</div>
        </div>`;
  }
  // Default: stand (A6 tent card)
  return `<div class="card" data-template="stand" data-theme="${theme}">
          <div class="card-inner">
            <div class="hotel-title">${esc(c.hotel)}</div>
            <div class="outlet-title">
              <span>${esc(c.title)}</span>
              <span class="area-pill">${esc(c.pill)}</span>
            </div>
            <div class="qr-box">${c.svg}</div>
            <div class="table-badge">
              <span class="sub">${c.caption}</span>
              <span class="label">${esc(c.label)}</span>
            </div>
            <div class="cta-box">
              <div class="cta-tr">${c.ctaTr}</div>
              <div class="cta-en">${c.ctaEn}</div>
            </div>
          </div>
        </div>`;
}

export type QrPrintPageInput = {
  title: string;
  barTitle: string;
  barName: string;
  count: string;
  template: QrPrintTemplate;
  theme: QrPrintTheme;
  /** Cards from `qrPrintCard`. */
  cards: string[];
  /** Optional toolbar filter (area / floor); changing it reloads the page with `param` set. */
  filter?: { label: string; param: string; all: string; value?: string; options: { id: string; label: string }[] };
  empty: string;
};

export function qrPrintPage(p: QrPrintPageInput): string {
  const { template, theme, cards } = p;
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<style>
*, *:before, *:after { box-sizing: border-box; }
body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  background-color: #f1f5f9;
  color: #0f172a;
}
.print-toolbar {
  position: sticky;
  top: 0;
  z-index: 1000;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 20px;
  background: #1e293b;
  color: #f8fafc;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
.bar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}
.bar-title strong { color: #f59e0b; }
.bar-count {
  background: rgba(255,255,255,0.15);
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
}
.bar-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.bar-controls label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #cbd5e1;
}
.bar-controls select {
  background: #334155;
  color: #fff;
  border: 1px solid #475569;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  outline: none;
}
.btn-print {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #d97706;
  color: #fff;
  font-weight: 600;
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
}
.btn-print:hover { background: #b45309; }

.print-wrap {
  max-width: 210mm;
  margin: 16px auto;
  padding: 0;
}
.grid {
  display: grid;
  gap: 6mm;
  padding: 8mm;
  background: #ffffff;
  box-shadow: 0 2px 10px rgba(0,0,0,0.08);
  min-height: 280mm;
}
.grid[data-template="stand"] {
  grid-template-columns: repeat(2, 1fr);
  gap: 8mm;
  padding: 10mm;
}
.grid[data-template="compact"] {
  grid-template-columns: repeat(2, 1fr);
  gap: 5mm;
  padding: 6mm;
}
.grid[data-template="badge"] {
  grid-template-columns: repeat(3, 1fr);
  gap: 5mm;
  padding: 6mm;
}

.card {
  box-sizing: border-box;
  background: #ffffff;
  border: 1px solid #999;
  border-radius: 8px;
  text-align: center;
  break-inside: avoid;
  page-break-inside: avoid;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  overflow: hidden;
}

/* STAND */
.card[data-template="stand"] {
  min-height: 124mm;
  max-height: 132mm;
  padding: 6mm 5mm 5mm;
  border: 1.5px solid #d4af37;
}
.card[data-template="stand"] .card-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 100%;
}
.card[data-template="stand"] .hotel-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
}
.card[data-template="stand"] .outlet-title {
  font-size: 12px;
  font-weight: 600;
  margin-top: 3px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.card[data-template="stand"] .area-pill {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid currentColor;
}
.card[data-template="stand"] .qr-box {
  margin: 4mm 0;
  padding: 2.5mm;
  background: #ffffff;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.card[data-template="stand"] svg {
  width: 44mm;
  height: 44mm;
  display: block;
}
.card[data-template="stand"] .table-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 16px;
  border-radius: 6px;
  margin-bottom: 3mm;
}
.card[data-template="stand"] .table-badge .sub {
  font-size: 8.5px;
  letter-spacing: 1px;
  font-weight: 700;
  opacity: 0.8;
}
.card[data-template="stand"] .table-badge .label {
  font-size: 20px;
  font-weight: 800;
  line-height: 1.1;
}
.card[data-template="stand"] .cta-box {
  width: 100%;
  padding-top: 3mm;
  border-top: 1px dashed rgba(0,0,0,0.15);
}
.card[data-template="stand"] .cta-tr {
  font-size: 10px;
  font-weight: 600;
}
.card[data-template="stand"] .cta-en {
  font-size: 8.5px;
  opacity: 0.75;
  margin-top: 1px;
}

/* COMPACT */
.card[data-template="compact"] {
  min-height: 60mm;
  max-height: 64mm;
  padding: 3mm 4mm;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 4mm;
}
.card[data-template="compact"] .compact-left svg {
  width: 32mm;
  height: 32mm;
  display: block;
}
.card[data-template="compact"] .compact-right {
  flex: 1;
  text-align: left;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}
.card[data-template="compact"] .hotel-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}
.card[data-template="compact"] .outlet-title {
  font-size: 11px;
  font-weight: 600;
}
.card[data-template="compact"] .area-pill {
  font-size: 9px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid currentColor;
  width: fit-content;
}
.card[data-template="compact"] .table-badge .label {
  font-size: 16px;
  font-weight: 800;
}
.card[data-template="compact"] .cta-tr {
  font-size: 8.5px;
  font-weight: 600;
}
.card[data-template="compact"] .cta-en {
  font-size: 7.5px;
  opacity: 0.75;
}

/* BADGE */
.card[data-template="badge"] {
  min-height: 58mm;
  max-height: 62mm;
  padding: 3mm;
  justify-content: space-between;
}
.card[data-template="badge"] .hotel-title {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
}
.card[data-template="badge"] .outlet-title {
  font-size: 10px;
  font-weight: 600;
}
.card[data-template="badge"] svg {
  width: 28mm;
  height: 28mm;
  display: block;
}
.card[data-template="badge"] .table-badge .label {
  font-size: 14px;
  font-weight: 800;
}
.card[data-template="badge"] .cta-tr {
  font-size: 8px;
  font-weight: 500;
}

/* THEMES */
.card[data-theme="royal"] {
  border-color: #d4af37;
  color: #1e293b;
  background: #fdfbf7;
}
.card[data-theme="royal"] .hotel-title { color: #92400e; }
.card[data-theme="royal"] .area-pill {
  color: #b45309;
  border-color: #f59e0b;
  background: #fef3c7;
}
.card[data-theme="royal"] .table-badge {
  background: #fef3c7;
  border: 1px solid #fde68a;
  color: #78350f;
}
.card[data-theme="royal"] .qr-box { border: 1px solid #fde68a; }

.card[data-theme="classic"] {
  border-color: #334155;
  color: #0f172a;
  background: #ffffff;
}
.card[data-theme="classic"] .hotel-title { color: #0f172a; }
.card[data-theme="classic"] .area-pill {
  color: #475569;
  border-color: #cbd5e1;
  background: #f8fafc;
}
.card[data-theme="classic"] .table-badge {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #0f172a;
}
.card[data-theme="classic"] .qr-box { border: 1px solid #e2e8f0; }

.card[data-theme="dark"] {
  border-color: #e2b96f;
  color: #f8fafc;
  background: #0f172a;
}
.card[data-theme="dark"] .hotel-title { color: #f59e0b; }
.card[data-theme="dark"] .area-pill {
  color: #fde68a;
  border-color: #d97706;
  background: rgba(245, 158, 11, 0.15);
}
.card[data-theme="dark"] .table-badge {
  background: #1e293b;
  border: 1px solid #334155;
  color: #fbbf24;
}
.card[data-theme="dark"] .qr-box { background: #ffffff; }
.card[data-theme="dark"] .cta-box { border-top-color: rgba(255,255,255,0.15); }

.empty { padding: 24px; text-align: center; }

@page {
  size: A4 portrait;
  margin: 6mm;
}
@media print {
  .no-print { display: none !important; }
  body { background: #ffffff !important; margin: 0; padding: 0; }
  .print-wrap { max-width: 100% !important; margin: 0 !important; }
  .grid {
    box-shadow: none !important;
    padding: 0 !important;
    margin: 0 !important;
    min-height: auto !important;
  }
  .card {
    box-shadow: none !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
</style>
</head>
<body>
<nav class="print-toolbar no-print">
  <div class="bar-left">
    <span class="bar-title">${esc(p.barTitle)}: <strong>${esc(p.barName)}</strong></span>
    <span class="bar-count">${esc(p.count)}</span>
  </div>
  <div class="bar-controls">
    <label>
      <span>Şablon:</span>
      <select onchange="updateParam('template', this.value)">
        <option value="stand" ${template === "stand" ? "selected" : ""}>Stand Kartı (A6 Dikey)</option>
        <option value="compact" ${template === "compact" ? "selected" : ""}>Kompakt Kart (A7 - 8'li)</option>
        <option value="badge" ${template === "badge" ? "selected" : ""}>Kare Etiket (12'li)</option>
      </select>
    </label>
    <label>
      <span>Tema:</span>
      <select onchange="updateParam('theme', this.value)">
        <option value="royal" ${theme === "royal" ? "selected" : ""}>Merit Royal (Altın &amp; Lüks)</option>
        <option value="classic" ${theme === "classic" ? "selected" : ""}>Klasik (Temiz Beyaz)</option>
        <option value="dark" ${theme === "dark" ? "selected" : ""}>Lounge (Koyu / Gece)</option>
      </select>
    </label>
    ${
      p.filter
        ? `<label>
      <span>${esc(p.filter.label)}:</span>
      <select onchange="updateParam('${p.filter.param}', this.value)">
        <option value="">${esc(p.filter.all)}</option>
        ${p.filter.options
          .map((o) => `<option value="${esc(o.id)}" ${p.filter?.value === o.id ? "selected" : ""}>${esc(o.label)}</option>`)
          .join("")}
      </select>
    </label>`
        : ""
    }
    <button type="button" class="btn-print" onclick="window.print()">
      Yazdır / PDF Kaydet
    </button>
  </div>
</nav>

<div class="print-wrap">
${cards.length ? `<div class="grid" data-template="${template}">${cards.join("")}</div>` : `<p class="empty">${esc(p.empty)}</p>`}
</div>

<script>
function updateParam(key, val) {
  var url = new URL(window.location.href);
  if (val) url.searchParams.set(key, val);
  else url.searchParams.delete(key);
  window.location.href = url.toString();
}
</script>
</body>
</html>`;
}
