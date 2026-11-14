import { beforeEach, describe, expect, it, vi } from "vitest";

const translateNoteForStaff = vi.fn();
vi.mock("@/modules/mybar/server/translateService", () => ({ translateNoteForStaff }));

const { staffNote, translatedNote, translateOrderNotes } = await import("@/modules/order/server/noteTranslation");

describe("order note translation", () => {
  beforeEach(() => translateNoteForStaff.mockReset());

  it("translates each distinct note once and keys the result by the original", async () => {
    translateNoteForStaff.mockImplementation(async (_hotel: string, note: string) => ({ noteTr: `TR:${note}`, srcLang: "ru" }));
    const map = await translateOrderNotes("h1", "ru", ["без лука", undefined, "без лука", " ", "острый"]);
    expect(translateNoteForStaff).toHaveBeenCalledTimes(2);
    expect(translatedNote(map, "без лука")).toEqual({ noteTr: "TR:без лука", srcLang: "ru" });
    expect(translatedNote(map, undefined)).toEqual({ noteTr: null, srcLang: null });
  });

  it("does not call a provider for a guest reading the menu in Turkish", async () => {
    const map = await translateOrderNotes("h1", "tr", ["soğansız"]);
    expect(translateNoteForStaff).not.toHaveBeenCalled();
    expect(map.size).toBe(0);
  });

  it("leaves a note the provider could not translate without an entry", async () => {
    translateNoteForStaff.mockResolvedValue({ noteTr: null, srcLang: null });
    const map = await translateOrderNotes("h1", "en", ["no onions"]);
    expect(translatedNote(map, "no onions").noteTr).toBeNull();
  });

  it("shows staff the Turkish note and keeps the guest's words beside it", () => {
    expect(staffNote({ note: "no onions", noteTr: "soğansız", noteSrcLang: "en" })).toEqual({
      note: "soğansız",
      noteOriginal: "no onions",
      noteLang: "en",
    });
    expect(staffNote({ note: "soğansız", noteTr: null })).toEqual({ note: "soğansız" });
    expect(staffNote({ note: null, noteTr: null })).toEqual({});
  });
});
