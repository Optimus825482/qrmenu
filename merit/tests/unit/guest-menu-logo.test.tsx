// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import tr from "@/lib/i18n/messages/tr.json";
import { DEFAULT_OUTLET_DESIGN, type DesignOptions } from "@/modules/menu/design";
import type { GuestMenu } from "@/modules/menu/server/guestMenu";
import { MenuView } from "@/modules/menu/ui/guest/MenuView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/modules/menu/ui/guest/useGuestEvents", () => ({
  useGuestEvents: () => ({ connected: true }),
}));

const LOGO = "/uploads/menu-logo/abc123/0123456789abcdef.webp";

function menuWith(options: Partial<DesignOptions>): GuestMenu {
  return {
    state: {
      outletId: "outlet",
      hotelId: "hotel",
      outletName: "Restoran",
      hotelName: "Otel",
      menuOpen: true,
      orderingOpen: true,
      pricesShown: true,
      currency: "EUR",
      theme: { bg: "#0f0d0a", accent: "#c9a24a", soft: "#1d1a14", textOnAccent: "#0f0d0a" },
      design: { ...DEFAULT_OUTLET_DESIGN, options: { ...DEFAULT_OUTLET_DESIGN.options, logoUrl: LOGO, ...options } },
      callOptions: [],
    },
    categories: [{
      id: "drinks",
      name: "İçecek",
      subcategories: [],
      items: [{ id: "tea", name: "Çay", imageUrl: null, allergens: [], tags: [], isAvailable: true, price: "3.00" }],
    }],
  };
}

function renderLogo(options: Partial<DesignOptions>) {
  const { container } = render(
    <NextIntlClientProvider locale="tr" messages={tr}>
      <MenuView menu={menuWith(options)} locale="tr" token="onizleme" />
    </NextIntlClientProvider>,
  );
  return { container, logos: [...container.querySelectorAll<HTMLImageElement>("img.g-hero-logo")] };
}

afterEach(cleanup);

describe("guest menu logo size and alignment", () => {
  it("draws the default logo medium and centred inside the hero", () => {
    const { logos } = renderLogo({});
    expect(logos).toHaveLength(1);
    expect(logos[0].getAttribute("src")).toBe(LOGO);
    expect(logos[0].dataset.size).toBe("MEDIUM");
    expect(logos[0].dataset.align).toBe("CENTER");
    expect(logos[0].closest(".g-design-hero")).not.toBeNull();
  });

  it.each([
    ["SMALL", "LEFT"],
    ["LARGE", "RIGHT"],
    ["MEDIUM", "CENTER"],
  ] as const)("puts %s / %s on the logo", (logoSize, logoAlign) => {
    const { logos } = renderLogo({ logoSize, logoAlign });
    expect(logos[0].dataset.size).toBe(logoSize);
    expect(logos[0].dataset.align).toBe(logoAlign);
  });

  it("draws a full-width logo once, above the hero box and without an alignment", () => {
    const { container, logos } = renderLogo({ logoSize: "FULL", logoAlign: "RIGHT" });
    expect(logos).toHaveLength(1);
    expect(logos[0].dataset.size).toBe("FULL");
    expect(logos[0].dataset.align).toBeUndefined();
    expect(logos[0].closest(".g-design-hero")).toBeNull();
    const banner = logos[0].closest<HTMLElement>(".g-logo-only");
    expect(banner?.dataset.size).toBe("FULL");
    const hero = container.querySelector(".g-design-hero");
    expect(hero).not.toBeNull();
    expect(banner!.compareDocumentPosition(hero!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps size and alignment on a logo shown without a hero", () => {
    const { container, logos } = renderLogo({ hero: "NONE", logoSize: "LARGE", logoAlign: "LEFT" });
    expect(container.querySelector(".g-design-hero")).toBeNull();
    expect(logos).toHaveLength(1);
    expect(logos[0].dataset.size).toBe("LARGE");
    expect(logos[0].dataset.align).toBe("LEFT");
    expect(logos[0].getAttribute("alt")).toBe("Restoran");
    expect(logos[0].closest<HTMLElement>(".g-logo-only")?.dataset.size).toBeUndefined();
  });

  it("draws no logo element without a logo", () => {
    expect(renderLogo({ logoUrl: "", logoSize: "FULL" }).logos).toHaveLength(0);
  });
});

describe("guest logo styles", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src/app/(guest)/guest.css"), "utf8");
  const rule = (selector: string) => css.slice(css.indexOf(`${selector} {`)).split("}")[0];

  it("the base rule is still the size logos had before the option (MEDIUM adds nothing)", () => {
    expect(rule(".g-hero-logo")).toContain("max-width: min(60%, 220px)");
    expect(rule(".g-hero-logo")).toContain("max-height: 96px");
    expect(css).not.toContain('.g-hero-logo[data-size="MEDIUM"]');
  });

  it("a full-width logo fills the column and keeps its aspect ratio", () => {
    const full = rule('.g-hero-logo[data-size="FULL"]');
    expect(full).toContain("width: 100%");
    expect(full).toContain("max-height: none");
    expect(full).not.toContain("height: 100%");
    expect(rule(".g-hero-logo")).toContain("height: auto");
    expect(rule('.g-logo-only[data-size="FULL"]')).toMatch(/padding: 0 0 /);
  });
});
