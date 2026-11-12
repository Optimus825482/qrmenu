/*
 * Reads the text of a central-warehouse delivery document (as the OCR returns it) into lines of
 * product + quantity + SKT. Nothing here is trusted: the result is only a preview the user corrects
 * before saving. Pure functions, no I/O.
 */

export type ParseProduct = { id: string; name: string };

export type ParsedLine = {
  /** The line as it was read. */
  raw: string;
  /** Best matching product, when one is close enough. */
  productId: string | null;
  /** 0..1: how much of the product's name was found in the line. */
  score: number;
  qty: number | null;
  /** SKT as yyyy-mm-dd. */
  expiryDate: string | null;
};

const TR_MAP: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

/** Lower-case ASCII with single spaces: "Çikolata  %70" -> "cikolata 70". */
export function normalizeText(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (ch) => TR_MAP[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Volume / weight / pack words: a number in front of one belongs to the product name, not to the quantity. */
const MEASURE = /^(ml|cl|lt|l|gr|g|kg|mg|cc|li|lik|luk|lu|cm)$/;
/** Words of a document's header and footer ("Fiş no: 4471", "Toplam 228"): never a product line. */
const HEADER = /^(no|numara|tarih|fis|fisi|irsaliye|evrak|belge|tel|telefon|toplam|sayfa|teslim|imza|saat)$/;
/** Words that say "pieces": the number in front of one is the quantity. */
const PIECE = /^(adet|ad|pcs|pc|koli|kutu|sise|paket|pkt)$/;

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function toIsoDate(day: number, month: number, year: number): string | null {
  const y = year < 100 ? 2000 + year : year;
  if (y < 2020 || y > 2100 || month < 1 || month > 12) return null;
  const last = [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day < 1 || day > last) return null;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Finds a date (dd.mm.yyyy, dd/mm/yy, mm.yyyy: the last day of that month) and returns the line without it. */
export function extractDate(line: string): { date: string | null; rest: string } {
  const full = /(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4}|\d{2})(?!\d)/.exec(line);
  if (full) {
    const date = toIsoDate(Number(full[1]), Number(full[2]), Number(full[3]));
    // A full date that does not exist ("31.02.2027") is dropped, never re-read as month and year.
    return { date, rest: line.replace(full[0], " ") };
  }
  const monthYear = /(?<!\d)(\d{1,2})\s*[./-]\s*(\d{4})(?!\d)/.exec(line);
  if (monthYear) {
    const month = Number(monthYear[1]);
    const year = Number(monthYear[2]);
    const last = [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
    const date = toIsoDate(last, month, year);
    if (date) return { date, rest: line.replace(monthYear[0], " ") };
  }
  return { date: null, rest: line };
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** OCR misreads a letter now and then: long words may differ by one character. */
function sameToken(a: string, b: string): boolean {
  if (a === b) return true;
  return a.length >= 5 && b.length >= 5 && editDistanceAtMostOne(a, b);
}

/** Share of the product's words found in the line, and which line words they used. */
function matchScore(productTokens: string[], lineTokens: string[]): { score: number; used: Set<number> } {
  const used = new Set<number>();
  let hit = 0;
  for (const token of productTokens) {
    const at = lineTokens.findIndex((candidate, index) => !used.has(index) && sameToken(candidate, token));
    if (at !== -1) {
      used.add(at);
      hit++;
    }
  }
  return { score: productTokens.length === 0 ? 0 : hit / productTokens.length, used };
}

/** Lowest share of a product name that must be in the line for the match to be offered. */
export const MATCH_THRESHOLD = 0.6;

/**
 * The quantity of a line: the number in front of a piece word ("24 adet"), else the last number that is
 * neither part of the matched product name nor a measure ("330 ml").
 */
function quantityOf(tokens: string[], usedByName: Set<number>): number | null {
  const numbers: { index: number; value: number }[] = [];
  tokens.forEach((token, index) => {
    if (!/^\d{1,5}$/.test(token) || usedByName.has(index)) return;
    const next = tokens[index + 1] ?? "";
    if (MEASURE.test(next)) return;
    numbers.push({ index, value: Number(token) });
  });
  const withPiece = numbers.find((n) => PIECE.test(tokens[n.index + 1] ?? ""));
  const chosen = withPiece ?? numbers[numbers.length - 1];
  return chosen && chosen.value > 0 ? chosen.value : null;
}

/** One line per product found in the text; lines without a quantity or without a word are left out. */
export function parseReceiptText(text: string, products: readonly ParseProduct[]): ParsedLine[] {
  const catalogue = products.map((product) => ({ id: product.id, tokens: normalizeText(product.name).split(" ").filter(Boolean) }));
  const out: ParsedLine[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const raw = rawLine.trim();
    if (raw.length < 3) continue;
    const { date, rest } = extractDate(raw);
    // "33cl" / "330ml" are written without a space as often as with one.
    const tokens = normalizeText(rest)
      .replace(/(\d)([a-z])/g, "$1 $2")
      .split(" ")
      .filter(Boolean);
    if (!tokens.some((token) => /^[a-z]{2,}$/.test(token))) continue;

    let best: { id: string; score: number; used: Set<number>; size: number } | null = null;
    for (const product of catalogue) {
      const tokensOfName = product.tokens.join(" ").replace(/(\d)([a-z])/g, "$1 $2").split(" ").filter(Boolean);
      const { score, used } = matchScore(tokensOfName, tokens);
      if (score < MATCH_THRESHOLD) continue;
      if (!best || score > best.score || (score === best.score && used.size > best.size)) {
        best = { id: product.id, score, used, size: used.size };
      }
    }
    // A line that names no product and reads like the document's header or footer is not offered at all.
    if (!best && tokens.some((token) => HEADER.test(token))) continue;
    const qty = quantityOf(tokens, best?.used ?? new Set());
    if (qty === null) continue;
    out.push({ raw, productId: best?.id ?? null, score: best ? Math.round(best.score * 100) / 100 : 0, qty, expiryDate: date });
  }
  return out;
}
