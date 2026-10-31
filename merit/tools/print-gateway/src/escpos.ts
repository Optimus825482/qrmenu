import iconv from "iconv-lite";

/**
 * ESC/POS kodlayıcı — metin satırlarını cp857 kod sayfasıyla yazıcı bayt dizisine çevirir.
 *
 * Bayt dizisi: ESC @ (init) → ESC t <n> (kod sayfası tablosu, cp857 için 13;
 * .env CODEPAGE_TABLE ile değiştirilebilir) → başlık bloğu (GS ! 0x11 çift boy +
 * ESC a 1 ortalama + başlık satırı) → GS ! 0x00 + ESC a 0 (normal boy, sola hizalı)
 * → her satır cp857 encode + \n → 4 boş satır → GS V 0 (tam kesim).
 */

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export type Codepage = "cp857";

export type EncodeReceiptOptions = {
  codepage: Codepage;
  /** Çift boyutlu, ortalı başlık satırı (otel · outlet). */
  title: string;
};

/** ESC t <n> için tablo numarası; env CODEPAGE_TABLE ile değiştirilebilir, varsayılan 13 (cp857). */
function codepageTableFromEnv(): number {
  const raw = process.env.CODEPAGE_TABLE;
  if (raw === undefined || raw.trim() === "") return 13;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 13;
}

export function encodeReceipt(lines: string[], opts: EncodeReceiptOptions): Buffer {
  const chunks: Buffer[] = [];
  const push = (bytes: number[] | Buffer) => {
    chunks.push(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
  };

  // ESC @ — yazıcıyı başlangıç durumuna al
  push([ESC, 0x40]);
  // ESC t <n> — karakter kod sayfası tablosunu seç (cp857 = 13, sahada doğrulanacak)
  push([ESC, 0x74, codepageTableFromEnv()]);

  // Başlık: çift boy + ortalama
  push([GS, 0x21, 0x11]); // GS ! 0x11
  push([ESC, 0x61, 0x01]); // ESC a 1
  push(iconv.encode(opts.title, opts.codepage));
  push([LF]);

  // Başlıktan sonra normal boy ve sola hizalama
  push([GS, 0x21, 0x00]); // GS ! 0x00
  push([ESC, 0x61, 0x00]); // ESC a 0

  for (const line of lines) {
    push(iconv.encode(line, opts.codepage));
    push([LF]);
  }

  // 4 boş satır (fişin kesim öncesi gevşemesi)
  push([LF, LF, LF, LF]);
  // GS V 0 — tam kesim
  push([GS, 0x56, 0x00]);

  return Buffer.concat(chunks);
}
