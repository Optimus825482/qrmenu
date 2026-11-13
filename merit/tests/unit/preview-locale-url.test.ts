import { describe, expect, it } from "vitest";
import { previewLocaleUrl } from "@/modules/menu/ui/guest/previewLocale";

describe("previewLocaleUrl", () => {
  it("önizleme adresinde kalır, yalnız lang değişir", () => {
    expect(previewLocaleUrl("https://x.test/q/onizleme/out1?theme=t1&lang=tr", "fr")).toBe(
      "/q/onizleme/out1?theme=t1&lang=fr",
    );
  });

  it("lang yoksa ekler ve misafir dil rotasına (/api/q/…/lang) gitmez", () => {
    const url = previewLocaleUrl("https://x.test/q/onizleme/out1", "fr");
    expect(url).toBe("/q/onizleme/out1?lang=fr");
    expect(url).not.toContain("/api/q/");
  });
});
