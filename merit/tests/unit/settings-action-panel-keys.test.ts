import { beforeEach, describe, expect, it, vi } from "vitest";

// The general settings action must not write the manual room entry keys: only the dedicated panel
// (saveManualEntryAction, which checks its own role list) may. No database: the service is mocked.
const set = vi.hoisted(() => vi.fn(async () => ({ key: "x" })));
const clearHotelOverride = vi.hoisted(() => vi.fn(async () => ({ key: "x" })));
const requireUser = vi.hoisted(() => vi.fn(async () => ({ user: { id: "u1" } })));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/modules/core/server/admin/settingsAdmin", () => ({ set, clearHotelOverride, scopes: vi.fn(), listGrouped: vi.fn() }));
vi.mock("@/modules/menu/server/translations", () => ({ testDeeplTranslation: vi.fn(), testGeminiTranslation: vi.fn() }));

const actions = await import("@/modules/core/server/admin/actions/settingsAdmin");

beforeEach(() => {
  set.mockClear();
  clearHotelOverride.mockClear();
});

describe("genel ayar eylemi: elle oda girişi anahtarları", () => {
  it.each(["minibar.manualRoomEntry", "minibar.manualRoomEntryFloorIds", "minibar.manualRoomEntryRoomIds"])(
    "%s genel yoldan yazılamaz ve temizlenemez (FORBIDDEN, servis çağrılmaz)",
    async (key) => {
      const res = await actions.setSettingAction({ hotelId: "h1", key, value: true });
      expect(res).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      const cleared = await actions.clearSettingOverrideAction({ hotelId: "h1", key });
      expect(cleared).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      expect(set).not.toHaveBeenCalled();
      expect(clearHotelOverride).not.toHaveBeenCalled();
    },
  );

  it("diğer anahtarlar servise gider", async () => {
    const res = await actions.setSettingAction({ hotelId: "h1", key: "minibar.requireQrForControl", value: true });
    expect(res.ok).toBe(true);
    expect(set).toHaveBeenCalledWith({ user: { id: "u1" } }, "h1", "minibar.requireQrForControl", true);
  });
});
