import { beforeEach, describe, expect, it, vi } from "vitest";

const translateNoteForStaff = vi.fn();
vi.mock("@/modules/mybar/server/translateService", () => ({ translateNoteForStaff }));

const { staffNote, translatedNote, translateOrderNotes } = await import("@/modules/order/server/noteTranslation");

describe("order note translation", () => {
  beforeEach(() => translateNoteForStaff.mockReset());

  it("translates each distinct note once and keys the result by the original", async () => {
    translateNoteForStaff.mockImplementation(async (_hotel: string, note: string) => ({ noteTr: `TR:${note}`, srcLang: "ru" }));
    const map = await translateOrderNotes("h1", ["без лука", undefined, "без лука", " ", "острый"]);
    expect(translateNoteForStaff).toHaveBeenCalledTimes(2);
    expect(translatedNote(map, "без лука")).toEqual({ noteTr: "TR:без лука", srcLang: "ru" });
    expect(translatedNote(map, undefined)).toEqual({ noteTr: null, srcLang: null });
  });

  it("goes by the language of the note, not of the menu: a Turkish note stays as written", async () => {
    // A guest reading the menu in Turkish may still write in another language, so every note is sent;
    // the provider detects Turkish and returns no translation.
    translateNoteForStaff.mockImplementation(async (_hotel: string, note: string) =>
      note === "soğansız" ? { noteTr: null, srcLang: "tr" } : { noteTr: "soğansız", srcLang: "en" },
    );
    const map = await translateOrderNotes("h1", ["soğansız", "no onions"]);
    expect(translateNoteForStaff).toHaveBeenCalledTimes(2);
    expect(translatedNote(map, "soğansız")).toEqual({ noteTr: null, srcLang: null });
    expect(translatedNote(map, "no onions")).toEqual({ noteTr: "soğansız", srcLang: "en" });
  });

  it("leaves a note the provider could not translate without an entry", async () => {
    translateNoteForStaff.mockResolvedValue({ noteTr: null, srcLang: null });
    const map = await translateOrderNotes("h1", ["no onions"]);
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
