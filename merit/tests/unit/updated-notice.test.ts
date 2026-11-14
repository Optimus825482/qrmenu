import { describe, expect, it } from "vitest";
import { UPDATED_NOTICE_AFTER_SEEN_MS, updatedNoticeShouldClose } from "@/shell/updatedNotice";

const base = { shownForMs: 0, sinceSeenMs: null, unattendedScreen: false };

describe("updatedNoticeShouldClose", () => {
  it("stays open on an unattended device, however long nobody touches it", () => {
    // The tablet reloaded itself at night: the notice must still be there in the morning.
    expect(updatedNoticeShouldClose({ ...base, shownForMs: 8 * 60 * 60_000 })).toBe(false);
  });

  it("closes a while after somebody is at the device", () => {
    expect(updatedNoticeShouldClose({ ...base, sinceSeenMs: UPDATED_NOTICE_AFTER_SEEN_MS - 1 })).toBe(false);
    expect(updatedNoticeShouldClose({ ...base, sinceSeenMs: UPDATED_NOTICE_AFTER_SEEN_MS })).toBe(true);
  });

  it("closes by itself on a wall screen, where nobody can press Tamam", () => {
    expect(updatedNoticeShouldClose({ ...base, unattendedScreen: true, shownForMs: UPDATED_NOTICE_AFTER_SEEN_MS - 1 })).toBe(false);
    expect(updatedNoticeShouldClose({ ...base, unattendedScreen: true, shownForMs: UPDATED_NOTICE_AFTER_SEEN_MS })).toBe(true);
  });
});
