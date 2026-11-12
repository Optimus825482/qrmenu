// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import tr from "@/lib/i18n/messages/tr.json";
import { DEFAULT_OUTLET_DESIGN } from "@/modules/menu/design";
import type { GuestMenu } from "@/modules/menu/server/guestMenu";
import { GuestFooter } from "@/modules/menu/ui/guest/GuestFooter";
import { GuestFrame } from "@/modules/menu/ui/guest/GuestFrame";
import { MenuBrowser } from "@/modules/menu/ui/guest/MenuBrowser";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/modules/menu/ui/guest/useGuestEvents", () => ({
  useGuestEvents: () => ({ connected: true }),
}));
vi.mock("@/shell/components/PwaInstallButton", () => ({ PwaInstallButton: () => null }));

const messages = {
  ...tr,
  guest: {
    ...tr.guest,
    rs: {
      ...tr.guest.rs,
      // The real Turkish table and room labels are identical. Distinguish the keys in this test.
      selections: { ...tr.guest.rs.selections, submit: "Oda seçimlerini gönder" },
    },
  },
};

const menu: GuestMenu = {
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
    design: DEFAULT_OUTLET_DESIGN,
    callOptions: [],
  },
  categories: [{
    id: "drinks",
    name: "İçecek",
    subcategories: [],
    items: [{ id: "tea", name: "Çay", imageUrl: null, allergens: [], tags: [], isAvailable: true, price: "3.00" }],
  }],
};

function guestMenu({ token, mode, pricesShown = true, orderingOpen = true, embedded = false }: {
  token: string;
  mode?: "table" | "room";
  pricesShown?: boolean;
  orderingOpen?: boolean;
  embedded?: boolean;
}) {
  const state = { ...menu.state, pricesShown, orderingOpen };
  const modeProps = mode ? { mode } : {};
  const place = mode === "room" ? { placeLabel: "Oda 101" } : {};
  const frameOptions = { ...place, embedded };
  return (
    <NextIntlClientProvider locale="tr" messages={messages}>
      <GuestFrame
        token={token}
        locale="tr"
        outletName={state.outletName}
        tableLabel={mode === "room" ? "" : "Masa 101"}
        {...frameOptions}
        theme={state.theme}
        design={state.design}
        footer={<GuestFooter token={token} locale="tr" {...modeProps} {...{ pricesShown, orderingOpen }} currency={state.currency} />}
      >
        <MenuBrowser token={token} locale="tr" {...modeProps} menu={{ ...menu, state }} />
      </GuestFrame>
    </NextIntlClientProvider>
  );
}

function selectTea() {
  fireEvent.click(screen.getByRole("button", { name: /Çay/ }));
  fireEvent.click(screen.getByRole("button", { name: tr.guest.cart.add }));
}

afterEach(cleanup);

describe("guest room service menu", () => {
  it("shows the room label, hides waiter calls, and uses the room submit translation", () => {
    render(guestMenu({ token: "room-open", mode: "room" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Oda 101");
    expect(screen.queryByRole("button", { name: tr.guest.call.waiter })).toBeNull();
    expect(screen.getByRole("tablist", { name: tr.guest.rs.menu.title })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: tr.guest.cart.title }));
    expect(screen.getByRole("button", { name: "Oda seçimlerini gönder" })).toBeTruthy();
  });

  it("renders omitted mode the same as explicit table mode", () => {
    const { container, rerender } = render(guestMenu({ token: "table" }));
    const defaultMarkup = container.innerHTML;
    expect(screen.getByRole("button", { name: tr.guest.call.waiter })).toBeTruthy();
    rerender(guestMenu({ token: "table", mode: "table" }));
    expect(container.innerHTML).toBe(defaultMarkup);
  });

  it("can apply the menu theme inside the room shell without duplicating the header or main", () => {
    const { container } = render(guestMenu({ token: "room-embedded", mode: "room", embedded: true }));
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByRole("main")).toBeNull();
    expect(container.querySelector<HTMLElement>(".g-frame")?.style.getPropertyValue("--m-accent")).toBe(menu.state.theme.accent);
    expect(screen.getByRole("tablist", { name: tr.guest.rs.menu.title })).toBeTruthy();
  });

  it("hides room prices in the menu, item sheet and selections when pricesShown is false", () => {
    const { container } = render(guestMenu({ token: "room-no-prices", mode: "room", pricesShown: false }));
    expect(container.textContent).not.toContain("€");
    fireEvent.click(screen.getByRole("button", { name: "Çay" }));
    expect(container.textContent).not.toContain("€");
    fireEvent.click(screen.getByRole("button", { name: tr.guest.cart.add }));
    fireEvent.click(screen.getByRole("button", { name: /^Seçimlerim/ }));
    expect(container.textContent).not.toContain("€");
  });

  it("room service asks for one optional note at the end, not one per dish", () => {
    render(guestMenu({ token: "room-notes", mode: "room" }));
    fireEvent.click(screen.getByRole("button", { name: /Çay/ }));
    // item sheet: quantity and add only
    expect(screen.queryByLabelText(tr.guest.cart.note)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: tr.guest.cart.add }));
    fireEvent.click(screen.getByRole("button", { name: /^Seçimlerim/ }));
    expect(screen.queryByLabelText(tr.guest.cart.note)).toBeNull();
    expect(screen.getByLabelText(tr.guest.rs.selections.note)).toBeTruthy();
    expect(screen.queryByLabelText(tr.guest.selections.generalNote)).toBeNull();
  });

  it("a table order keeps the per-dish note and the general note", () => {
    render(guestMenu({ token: "table-notes", mode: "table" }));
    fireEvent.click(screen.getByRole("button", { name: /Çay/ }));
    expect(screen.getByLabelText(tr.guest.cart.note)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: tr.guest.cart.add }));
    fireEvent.click(screen.getByRole("button", { name: /^Seçimlerim/ }));
    expect(screen.getByLabelText(tr.guest.cart.note)).toBeTruthy();
    expect(screen.getByLabelText(tr.guest.selections.generalNote)).toBeTruthy();
  });

  it("hides the room selections button when ordering closes with selections still pending", () => {
    const options = { token: "room-closed", mode: "room" } as const;
    const { rerender } = render(guestMenu(options));
    selectTea();
    expect(screen.getByRole("button", { name: /^Seçimlerim/ })).toBeTruthy();
    rerender(guestMenu({ ...options, orderingOpen: false }));
    expect(screen.queryByRole("button", { name: /^Seçimlerim/ })).toBeNull();
  });
});
