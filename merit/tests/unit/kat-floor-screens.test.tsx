// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffScreensProvider } from "@/components/staff/StaffScreens";
import { canViewPath } from "@/components/staff/backTarget";
import { resetBackStack } from "@/shell/backStack";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({
  useParams: () => ({ floorId: "f1" }),
  useRouter: () => router,
  usePathname: () => "/kat/doluluk/f1",
  useSearchParams: () => new URLSearchParams("hotelId=h1"),
}));

const FLOOR = {
  floor: { id: "f1", number: 1, name: "1. Kat", hotelId: "h1", hotelName: "Merit Test" },
  today: "2026-11-13",
  rooms: [
    {
      id: "r101",
      number: "101",
      floorId: "f1",
      floorName: "1. Kat",
      roomTypeId: null,
      roomTypeName: "Standart",
      status: "in_house",
      statusLabel: "Konaklayan",
      checkStatus: "pending",
      dndCount: 0,
      hasMybarRequest: false,
    },
  ],
  stats: { total: 1, occupied: 1, empty: 0, arrival: 0, departure: 0, completed: 0, dnd: 0, mybar: 0 },
  settings: { dndRecheckMinutes: 30, requireQrForControl: false },
};

vi.mock("@/modules/minibar/ui/mbFetch", () => ({
  mbFetch: vi.fn(async (url: string) => {
    if (url.endsWith("/mmd")) return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    if (url.endsWith("/dnd")) return new Response(JSON.stringify({ error: "yok" }), { status: 404 });
    return new Response(JSON.stringify(FLOOR), { status: 200 });
  }),
}));

const { default: FloorPage } = await import("@/app/kat/doluluk/[floorId]/page");

beforeEach(() => resetBackStack());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderFor(visible: string[]) {
  render(
    <StaffScreensProvider visible={visible}>
      <FloorPage />
    </StaffScreensProvider>,
  );
}

/** Every link on screen opens for this user (never a way to /yetkisiz). */
function expectOnlyViewableLinks(visible: string[]) {
  const set = new Set(visible);
  for (const a of document.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href")!;
    expect([href, canViewPath(set, href)]).toEqual([href, true]);
  }
}

describe("Kat sayfası — yalnız MB-KAT (E1/E4)", () => {
  it("oda kartında kontrol yok; oda penceresinde kontrol, DND, MMD ve QR yok; Geri kat planına", async () => {
    const visible = ["MB-KAT"];
    renderFor(visible);
    await screen.findByText("Oda 101");
    expect(screen.queryByText("Kontrol →")).toBeNull();
    expectOnlyViewableLinks(visible);
    expect(screen.getByTestId("katlar-geri").getAttribute("href")).toBe("/kat?hotelId=h1");

    fireEvent.click(screen.getByText("Oda 101").closest("[role='button']")!);
    await screen.findByRole("dialog");
    expect(screen.queryByText(/Minibar Kontrol Ekranını Aç/)).toBeNull();
    expect(screen.queryByText(/Odayı DND Olarak İşaretle/)).toBeNull();
    expect(screen.queryByTestId("mmd-button")).toBeNull();
    expect(screen.queryByRole("button", { name: /QR Okut/ })).toBeNull();
    expectOnlyViewableLinks(visible);
  });

  it("MB-TUK ile oda kontrolü ve kayıt düğmeleri görünür", async () => {
    renderFor(["MB-KAT", "MB-TUK"]);
    await screen.findByText("Oda 101");
    expect(screen.getByText("Kontrol →")).toBeTruthy();
    fireEvent.click(screen.getByText("Oda 101").closest("[role='button']")!);
    await screen.findByRole("dialog");
    await waitFor(() => expect(screen.getByText(/Minibar Kontrol Ekranını Aç/)).toBeTruthy());
    expect(screen.getByTestId("mmd-button")).toBeTruthy();
  });
});
