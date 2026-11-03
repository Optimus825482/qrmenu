import type { TranslationProvider } from "./provider";

const ENDPOINT = "https://translate.googleapis.com/translate_a/single";

/** Google "gtx" web endpoint, same call as the live template's translate service. */
export const gtxProvider: TranslationProvider = {
  name: "gtx",
  async translate(text, { to, from, signal }) {
    const url = `${ENDPOINT}?client=gtx&sl=${encodeURIComponent(from ?? "auto")}&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`gtx HTTP ${res.status}`);
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error("gtx yanıtı geçersiz");
    const out = (data[0] as unknown[])
      .map((segment) => (Array.isArray(segment) && typeof segment[0] === "string" ? segment[0] : ""))
      .join("");
    const sourceLang = typeof data[2] === "string" ? data[2] : (from ?? "auto");
    const translated = sourceLang !== to && out.toLowerCase() !== text.toLowerCase();
    return { text: out, sourceLang, translated };
  },
};
