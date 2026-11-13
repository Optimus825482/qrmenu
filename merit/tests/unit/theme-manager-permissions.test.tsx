// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Two different rights meet on the theme toolbar. Themes are system-wide, so creating, editing, deleting one
// and choosing the default belong to the system administrator (`canWrite`). Giving a theme to an outlet is an
// outlet-level right the server already decides (`themes.assignTargets` lists only the outlets the user may
// write): the "Önizlenen Outlete Ata" button follows that list, not `canWrite`.

const listThemes = vi.hoisted(() => vi.fn());
const assignTargets = vi.hoisted(() => vi.fn());
const assignTheme = vi.hoisted(() => vi.fn());
const setDefaultTheme = vi.hoisted(() => vi.fn());
vi.mock("@/modules/menu/server/actions/themes", () => ({
  assignThemeAction: assignTheme,
  createThemeAction: vi.fn(),
  deleteThemeAction: vi.fn(),
  listThemesAction: listThemes,
  setDefaultThemeAction: setDefaultTheme,
  themeAssignTargetsAction: assignTargets,
  updateThemeAction: vi.fn(),
}));

const studio = vi.hoisted(() => ({
  activeOutletId: "",
  activeOutletName: "",
  activeHotelId: "h1",
  previewThemeId: "",
  themeOverride: null,
  selectOutlet: vi.fn(),
  selectHotel: vi.fn(),
  selectTheme: vi.fn(),
  clearThemeOverride: vi.fn(),
}));
// The studio (phone preview, menu tree, uploads) is out of this test: only the library slot is rendered.
vi.mock("@/modules/menu/ui/MenuDesignStudio", () => ({
  MenuDesignStudio: ({ library }: { library: (s: typeof studio) => ReactNode }) => <div>{library(studio)}</div>,
}));
// The grid is reduced to its toolbar and one select button per row.
vi.mock("@/shell/ui/DataGrid", () => ({
  DataGrid: ({ rows, toolbar, onSelect }: { rows: { id: string; name: string }[]; toolbar: ReactNode; onSelect(row: unknown): void }) => (
    <div>
      {toolbar}
      {rows.map((row) => (
        <button key={row.id} type="button" onClick={() => onSelect(row)}>
          {`seç ${row.name}`}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("@/shell/ui/FormDialog", () => ({ FormDialog: () => null }));
vi.mock("@/shell/useSse", () => ({ useSse: () => ({ status: "open" }) }));
vi.mock("@/shell/confirm", () => ({ confirm: vi.fn(async () => true) }));
vi.mock("@/shell/notify", () => ({ notify: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/icons/Icon", () => ({ Icon: () => null }));

import { ThemeManager } from "@/modules/menu/ui/ThemeManager";
import type { AppProps } from "@/shell/registry";

const themes = [
  { id: "t1", name: "Kum", bg: "#ffffff", accent: "#000000", soft: "#eeeeee", textOnAccent: "#ffffff", isDefault: true, outletCount: 0 },
  { id: "t2", name: "Gece", bg: "#000000", accent: "#ffffff", soft: "#222222", textOnAccent: "#000000", isDefault: false, outletCount: 0 },
];
const design = {} as never;
const writable = [
  { hotelId: "h1", hotelName: "Royal", outlets: [{ id: "o1", name: "Havuz Bar", themeId: null, currency: "EUR", design }] },
];

const ASSIGN = "Önizlenen Outlete Ata";
const DEFAULT = "Varsayılan yap";

async function open(opts: { canWrite: boolean; targets: typeof writable; activeOutletId: string }) {
  listThemes.mockResolvedValue({ ok: true, data: { themes, canWrite: opts.canWrite } });
  assignTargets.mockResolvedValue({ ok: true, data: opts.targets });
  studio.activeOutletId = opts.activeOutletId;
  studio.activeOutletName = opts.activeOutletId ? "Havuz Bar" : "";
  const props = { windowId: "w1", hotelId: "h1", setStatus: () => {}, setDirty: () => {}, close: () => {} } as unknown as AppProps;
  render(<ThemeManager {...props} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "seç Gece" })).toBeDefined());
}

beforeEach(() => {
  assignTheme.mockResolvedValue({ ok: true, data: null });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ThemeManager: who sees which toolbar button", () => {
  it("lets a non-system user assign the selected theme to a previewed outlet the server lists as writable", async () => {
    await open({ canWrite: false, targets: writable, activeOutletId: "o1" });
    const button = screen.getByRole("button", { name: ASSIGN });
    // Nothing to assign until a theme is selected.
    expect(button).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "seç Gece" }));
    expect(button).toHaveProperty("disabled", false);
    fireEvent.click(button);
    await waitFor(() => expect(assignTheme).toHaveBeenCalledWith({ outletId: "o1", themeId: "t2" }));
  });

  it("keeps the system-wide theme buttons away from that same user", async () => {
    await open({ canWrite: false, targets: writable, activeOutletId: "o1" });
    expect(screen.queryByRole("button", { name: DEFAULT })).toBeNull();
    expect(screen.queryByRole("button", { name: "Yeni kayıt" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Seçili kaydı düzenle" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Seçili kaydı sil" })).toBeNull();
  });

  it("shows no assign button for a previewed outlet the server does not list (passive, foreign or not writable)", async () => {
    await open({ canWrite: false, targets: writable, activeOutletId: "o-yabanci" });
    expect(screen.queryByRole("button", { name: ASSIGN })).toBeNull();
  });

  it("shows no assign button when the user may write no outlet at all or none is previewed", async () => {
    await open({ canWrite: false, targets: [], activeOutletId: "o1" });
    expect(screen.queryByRole("button", { name: ASSIGN })).toBeNull();
    cleanup();
    await open({ canWrite: false, targets: writable, activeOutletId: "" });
    expect(screen.queryByRole("button", { name: ASSIGN })).toBeNull();
  });

  it("gives the system administrator both, and still hides assign for an outlet outside the list", async () => {
    await open({ canWrite: true, targets: writable, activeOutletId: "o1" });
    expect(screen.getByRole("button", { name: DEFAULT })).toBeDefined();
    expect(screen.getByRole("button", { name: ASSIGN })).toBeDefined();
    expect(screen.getByRole("button", { name: "Yeni kayıt" })).toBeDefined();
    cleanup();
    await open({ canWrite: true, targets: writable, activeOutletId: "o-yabanci" });
    expect(screen.getByRole("button", { name: DEFAULT })).toBeDefined();
    expect(screen.queryByRole("button", { name: ASSIGN })).toBeNull();
  });
});
