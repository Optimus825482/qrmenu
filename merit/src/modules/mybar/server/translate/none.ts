import type { TranslationProvider } from "./provider";

/** No-op provider: nothing leaves the premises. */
export const noneProvider: TranslationProvider = {
  name: "none",
  async translate(text) {
    return { text, sourceLang: "auto", translated: false };
  },
};
