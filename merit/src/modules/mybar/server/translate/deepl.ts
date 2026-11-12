import type { TranslationProvider } from "./provider";

/** Our locale -> DeepL target code. */
const TARGET: Record<string, string> = {
  tr: "TR", en: "EN-GB", de: "DE", ru: "RU", ar: "AR", fr: "FR", el: "EL", it: "IT", pt: "PT-BR",
};

/** DeepL with the key from Denetim Masası → Sistem → Çeviri (free keys end in ":fx"). */
export function deeplProvider(apiKey: string): TranslationProvider {
  const endpoint = apiKey.endsWith(":fx") ? "https://api-free.deepl.com/v2/translate" : "https://api.deepl.com/v2/translate";
  return {
    name: "deepl",
    backgroundTimeoutMs: 8000,
    async translate(text, { to, from, signal }) {
      const target = TARGET[to];
      if (!target) throw new Error(`deepl hedef dil desteklenmiyor: ${to}`);
      const body = new URLSearchParams({ text, target_lang: target });
      if (from) body.set("source_lang", from.toUpperCase());
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { authorization: `DeepL-Auth-Key ${apiKey}`, "content-type": "application/x-www-form-urlencoded" },
        body,
        signal,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`deepl HTTP ${res.status}`);
      const data = (await res.json()) as { translations?: { text?: unknown; detected_source_language?: unknown }[] };
      const first = data.translations?.[0];
      if (!first || typeof first.text !== "string") throw new Error("deepl yanıtı geçersiz");
      const out = first.text.trim();
      const sourceLang =
        typeof first.detected_source_language === "string" ? first.detected_source_language.toLowerCase() : (from ?? "auto");
      const translated = out.length > 0 && sourceLang !== to && out.toLowerCase() !== text.toLowerCase();
      return { text: out, sourceLang, translated };
    },
  };
}
