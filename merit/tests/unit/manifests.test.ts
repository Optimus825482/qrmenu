import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildManifest } from "@/shell/manifests";

const PUBLIC = join(__dirname, "..", "..", "public");

describe("buildManifest", () => {
  const admin = buildManifest("admin");
  const personel = buildManifest("personel");
  const pos = buildManifest("pos");
  const kds = buildManifest("pos", { screen: "kds" });

  it("admin: /admin standalone", () => {
    expect(admin).toMatchObject({ start_url: "/admin", display: "standalone", scope: "/" });
  });

  it("personel: portrait, standalone, kısa ad ve başlangıç", () => {
    expect(personel).toMatchObject({
      id: "/personel?v=1",
      start_url: "/baslat?kabuk=personel",
      display: "standalone",
      orientation: "portrait",
      short_name: "Merit Personel",
      scope: "/",
    });
  });

  it("pos: fullscreen, landscape, /baslat?kabuk=pos", () => {
    expect(pos.display).toBe("fullscreen");
    expect(pos.orientation).toBe("landscape");
    expect(pos.start_url).toBe("/baslat?kabuk=pos");
    expect(pos.short_name).toBe("Merit Kasa");
    expect(pos.id).toBe("/pos?v=1");
    expect(pos.scope).toBe("/");
  });

  it("kds varyantı: orientation any, ad Merit Mutfak, ayrı id ve başlangıç", () => {
    expect(kds.orientation).toBe("any");
    expect(kds.short_name).toBe("Merit Mutfak");
    expect(kds.id).toBe("/pos?e=kds");
    expect(kds.start_url).toBe("/baslat?kabuk=pos&ekran=kds");
    expect(kds.display).toBe("fullscreen");
  });

  it("kimlikler farklı", () => {
    const ids = [admin.id, personel.id, pos.id, kds.id];
    expect(new Set(ids).size).toBe(4);
  });

  it("theme_color kabuğa göre, simgeler farklı zeminde", () => {
    expect(new Set([admin.theme_color, personel.theme_color, pos.theme_color]).size).toBe(3);
    const srcs = (m: typeof pos) => (m.icons ?? []).map((i) => i.src);
    expect(srcs(personel).join()).not.toBe(srcs(pos).join());
  });

  it("simge dosyaları mevcut ve maskeli simge içeriyor", () => {
    for (const m of [admin, personel, pos, kds]) {
      const icons = m.icons ?? [];
      expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
      for (const icon of icons) {
        const file = icon.src.split("?")[0];
        expect(existsSync(join(PUBLIC, file)), file).toBe(true);
      }
    }
  });

  it("'sepet' kelimesi yok", () => {
    const text = JSON.stringify([admin, personel, pos, kds]).toLowerCase();
    expect(text).not.toContain("sepet");
  });
});
