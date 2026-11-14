import { describe, expect, it, vi } from "vitest";
import { noteKey, translatePendingNotes } from "@/modules/order/server/noteBackfill";

describe("translatePendingNotes (one-time backfill of old order notes)", () => {
  it("translates each distinct note of a hotel once", async () => {
    const translate = vi.fn(async (_hotel: string, note: string) => ({ noteTr: `TR:${note}`, srcLang: "en" }));
    const result = await translatePendingNotes(
      [
        { hotelId: "h1", note: "no onions" },
        { hotelId: "h1", note: " no onions " },
        { hotelId: "h2", note: "no onions" },
      ],
      translate,
    );
    expect(translate).toHaveBeenCalledTimes(2);
    expect(result.translated.get(noteKey("h1", "no onions"))).toEqual({ noteTr: "TR:no onions", srcLang: "en" });
    expect(result.failed).toBe(0);
  });

  it("keeps a Turkish note as written and remembers it as Turkish", async () => {
    const translate = vi.fn(async () => ({ noteTr: null, srcLang: "tr" }));
    const result = await translatePendingNotes([{ hotelId: "h1", note: "soğansız" }], translate);
    expect(result.translated.size).toBe(0);
    expect(result.turkish.has(noteKey("h1", "soğansız"))).toBe(true);
    expect(result.failed).toBe(0);
  });

  it("counts a note the provider could not answer as failed, so the run is repeated", async () => {
    const translate = vi.fn(async (_hotel: string, note: string) =>
      note === "bad" ? { noteTr: null, srcLang: null } : { noteTr: "iyi", srcLang: "en" },
    );
    const result = await translatePendingNotes(
      [
        { hotelId: "h1", note: "bad" },
        { hotelId: "h1", note: "good" },
      ],
      translate,
    );
    expect(result.failed).toBe(1);
    expect(result.translated.size).toBe(1);
  });

  it("does not count a translation equal to the original as a translation", async () => {
    const translate = vi.fn(async () => ({ noteTr: "Coca Cola", srcLang: "en" }));
    const result = await translatePendingNotes([{ hotelId: "h1", note: "Coca Cola" }], translate);
    expect(result.translated.size).toBe(0);
    expect(result.turkish.size).toBe(1);
  });
});
