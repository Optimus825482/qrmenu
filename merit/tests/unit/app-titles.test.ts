import { describe, expect, it } from "vitest";
import { registerCoreApps } from "@/modules/core/apps";
import { screenForPath } from "@/modules/core/screenPaths";
import { SCREENS } from "@/modules/core/screens";
import { registerMenuApps } from "@/modules/menu/apps";
import { registerMinibarApps } from "@/modules/minibar/apps";
import { registerMybarApps } from "@/modules/mybar/apps";
import { registerOrderApps } from "@/modules/order/apps";
import { getApps } from "@/shell/registry";
import { hasPage } from "../helpers/appRoutes";

registerCoreApps();
registerMenuApps();
registerOrderApps();
registerMinibarApps();
registerMybarApps();

describe("registered XP apps", () => {
  it.each(getApps())("$id uses the catalogue title", (app) => {
    expect(app.title).toBe(SCREENS.find((screen) => screen.code === app.screenCode)?.name);
  });

  it("opens every former minibar frame on a real route owned by its catalogue screen", () => {
    // The minibar screens are now iframe apps (kind "iframe" + url); other apps may still use external.href.
    const hrefOf = (app: ReturnType<typeof getApps>[number]) => app.external?.href ?? (app.kind === "iframe" ? app.url : undefined);
    const externalApps = getApps().filter((app) => app.id.startsWith("minibar.") && hrefOf(app));
    expect(externalApps.map((app) => app.id)).toEqual(expect.arrayContaining([
      "minibar.kat", "minibar.rota", "minibar.doluluk", "minibar.stok", "minibar.rapor", "minibar.tanim",
    ]));
    for (const app of externalApps) {
      const href = hrefOf(app)!;
      expect(hasPage(href), href).toBe(true);
      expect(screenForPath(href)?.code, href).toBe(app.screenCode);
    }
  });
});
