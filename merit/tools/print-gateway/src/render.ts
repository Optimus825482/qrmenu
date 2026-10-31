/**
 * Fiş metin düzenleyici — tamamen bağımsız (merit/src'den import YASAK).
 * ReceiptPayload şekli brief ile birebir aynıdır (sunucudaki receipt.ts ile aynı tel format).
 */

export type ReceiptItem = {
  name: string;
  qty: number;
  note?: string;
  unitPrice?: string;
  total?: string;
};

export type ReceiptPayload = {
  v: 1;
  header: { hotel: string; outlet: string };
  orderNo: number;
  table: string;
  /** 'HH:mm dd.MM.yyyy' biçiminde (Nicosia saat dilimi), sunucuda oluşturulur. */
  at: string;
  waiter?: string;
  items: ReceiptItem[];
  pricesShown: boolean;
  subtotal?: string;
  currency?: string;
  footer: string[];
};

/** 80 mm kâğıt → 48 sütun, 58 mm kâğıt → 32 sütun. */
export type PaperWidth = 48 | 32;

function truncate(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  return text.length <= maxWidth ? text : text.slice(0, maxWidth);
}

/** Metni width içinde yatay olarak ortalar; sığmazsa kırpar. */
function center(text: string, width: number): string {
  const t = truncate(text, width);
  if (t.length >= width) return t;
  const left = Math.floor((width - t.length) / 2);
  return `${" ".repeat(left)}${t}`;
}

/** Sol ve sağ metni aynı satırda aralarında boşluk doldurarak yazar; satır asla width'i aşmaz. */
function twoColumns(left: string, right: string, width: number): string {
  if (right.length >= width) return truncate(right, width);
  const maxLeft = width - right.length - 1; // aralarında en az 1 boşluk
  const l = truncate(left, Math.max(0, maxLeft));
  const pad = Math.max(1, width - l.length - right.length);
  return `${l}${" ".repeat(pad)}${right}`;
}

/**
 * Fişi metin satırlarına döker.
 * Kurallar: başlık (otel · outlet) ortalı; `#no  Masa  saat`; garson (varsa);
 * kalemler `ad ×adet` solda, `total` varsa sağa hizalı; not satırı `  * not`;
 * pricesShown ise toplam çizgisi (subtotal + currency); footer en sona.
 * Satırlar asla width'i aşmaz (uzun ad kırpılır).
 */
export function renderReceipt(payload: ReceiptPayload, width: PaperWidth): string[] {
  const lines: string[] = [];

  lines.push(center(`${payload.header.hotel} · ${payload.header.outlet}`, width));
  lines.push(truncate(`#${payload.orderNo}  ${payload.table}  ${payload.at}`, width));
  if (payload.waiter) {
    lines.push(truncate(`Garson: ${payload.waiter}`, width));
  }

  for (const item of payload.items) {
    const left = `${item.name} ×${item.qty}`;
    if (item.total !== undefined) {
      lines.push(twoColumns(left, item.total, width));
    } else {
      lines.push(truncate(left, width));
    }
    if (item.note) {
      lines.push(truncate(`  * ${item.note}`, width));
    }
  }

  if (payload.pricesShown && payload.subtotal !== undefined) {
    const right = payload.currency ? `${payload.subtotal} ${payload.currency}` : payload.subtotal;
    lines.push(twoColumns("TOPLAM", right, width));
  }

  for (const footerLine of payload.footer) {
    lines.push(truncate(footerLine, width));
  }

  return lines;
}
