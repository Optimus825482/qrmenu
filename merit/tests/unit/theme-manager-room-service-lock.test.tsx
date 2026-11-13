// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// "Oda Servisi Menü Tasarım Stüdyosu" (rs.tema) opens the same ThemeManager as the QR menu's design center.
// Opened from the room-service group it must offer only the room-service outlets: without the lock the studio
// fell on the hotel's first outlet by name (a lobby bar) under a room-service title.

const listThemes = vi.hoisted(() => vi.fn());
const assignTargets = vi.hoisted(() => vi.fn());
vi.mock("@/modules/menu/server/actions/themes", () => ({
  assignThemeAction: vi.fn(),
  createThemeAction: vi.fn(),
  deleteThemeAction: vi.fn(),
  listThemesAction: listThemes,
  setDefaultThemeAction: vi.fn(),
  themeAssignTargetsAction: assignTargets,
  updateThemeAction: vi.fn(),
}));

type Target = { hotelId: string; hotelName: string; outlets: { id: string; name: string }[] };
// The studio is reduced to the list of outlets it was handed.
vi.mock("@/modules/menu/ui/MenuDesignStudio", () => ({
  MenuDesignStudio: ({ targets }: { targets: Target[] }) => (
    <ul>
      {targets.flatMap((t) => t.outlets.map((o) => <li key={o.id}>{`${t.hotelName} / ${o.name}`}</li>))}
    </ul>
  ),
}));
vi.mock("@/shell/ui/FormDialog", () => ({ FormDialog: () => null }));
vi.mock("@/shell/useSse", () => ({ useSse: () => ({ status: "open" }) }));
vi.mock("@/components/icons/Icon", () => ({ Icon: () => null }));

import { ThemeManager } from "@/modules/menu/ui/ThemeManager";
import type { AppProps } from "@/shell/registry";

const design = {} as never;
const outlet = (id: string, name: string, type: string) => ({ id, name, type, themeId: null, currency: "USD", design });
const targets = [
  { hotelId: "h1", hotelName: "Royal Diamond", outlets: [outlet("o1", "Diamond Lobby Bar", "BAR"), outlet("o2", "Oda Servisi", "ODA_SERVISI")] },
  { hotelId: "h2", hotelName: "Park", outlets: [outlet("o3", "Havuz Bar", "BAR")] },
];

async function open(extra: Record<string, unknown>) {
  listThemes.mockResolvedValue({ ok: true, data: { themes: [], canWrite: true } });
  assignTargets.mockResolvedValue({ ok: true, data: targets });
  const props = { windowId: "w1", setStatus: () => {}, setDirty: () => {}, close: () => {}, ...extra } as unknown as AppProps;
  render(<ThemeManager {...props} />);
  await waitFor(() => expect(screen.getByText("Royal Diamond / Oda Servisi")).toBeDefined());
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ThemeManager: room-service lock", () => {
  it("hands the studio only room-service outlets, and drops hotels left without one", async () => {
    await open({ lockOutletType: "ODA_SERVISI" });
    expect(screen.queryByText("Royal Diamond / Diamond Lobby Bar")).toBeNull();
    expect(screen.queryByText("Park / Havuz Bar")).toBeNull();
  });

  it("keeps every outlet when opened as the general menu design center", async () => {
    await open({});
    expect(screen.getByText("Royal Diamond / Diamond Lobby Bar")).toBeDefined();
    expect(screen.getByText("Park / Havuz Bar")).toBeDefined();
  });
});
