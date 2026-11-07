import { describe, expect, it } from "vitest";
import { registerCoreApps } from "@/modules/core/apps";
import { screenForPath } from "@/modules/core/screenPaths";
import { APP_FOLDERS } from "@/shell/appFolders";
import { getApp, getApps } from "@/shell/registry";
import { hasPage } from "../helpers/appRoutes";

registerCoreApps();

describe("Operasyon Radarı ayrı modül klasörü", () => {
  it("klasör ve iki başlatıcı RADAR kategorisinde, CR-RAD izniyle", () => {
    const radarApps = getApps().filter((a) => a.category === "RADAR").map((a) => a.id);
    expect(radarApps).toEqual(["folder.radar", "core.radar", "core.radar.duvar"]);
    for (const id of radarApps) {
      const app = getApp(id)!;
      expect(app.screenCode, id).toBe("CR-RAD");
      expect(app.moduleKey, id).toBe("CORE");
      expect(app.needsHotel, id).toBe(false);
    }
    expect(getApp("core.radar")!.launchLabel).toBe("Canlı Radar");
    expect(getApp("core.radar.duvar")!.launchLabel).toBe("Duvar Ekranı");
    expect(getApp("folder.radar")!.launchLabel).toBe("Operasyon Radarı");
  });

  it("Duvar Ekranı /radar adresini yeni sekmede açar; Canlı Radar pencere olarak kalır", () => {
    const wall = getApp("core.radar.duvar")!;
    expect(wall.external).toEqual({ href: "/radar" });
    expect(hasPage("/radar")).toBe(true);
    expect(screenForPath("/radar")?.code).toBe("CR-RAD");
    expect(getApp("core.radar")!.external).toBeUndefined();
    expect(getApp("core.radar")!.component).toBeTypeOf("function");
  });

  it("başlat menüsünde kendi klasörü var; Komuta Merkezi Genel'de kalır", () => {
    expect(APP_FOLDERS.find((f) => f.id === "radar")).toEqual({ id: "radar", label: "Operasyon Radarı", categories: ["RADAR"] });
    expect(APP_FOLDERS.find((f) => f.id === "sistem")!.categories).not.toContain("RADAR");
    expect(getApp("core.komuta")!.category).toBe("GENEL");
  });
});
