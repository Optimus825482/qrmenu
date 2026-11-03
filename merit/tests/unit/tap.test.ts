import { describe, expect, it } from "vitest";
import { TAP, tapFor } from "@/components/ui/tap";

describe("tapFor", () => {
  it("maps density and role to pixels", () => {
    expect(tapFor("pos", "primary")).toBe(64);
    expect(tapFor("personel", "action")).toBe(48);
    expect(tapFor("xp", "icon")).toBe(24);
    expect(tapFor("personel", "primary")).toBe(56);
    expect(tapFor("pos", "action")).toBe(56);
    expect(tapFor("pos", "icon")).toBe(56);
    expect(tapFor("personel", "icon")).toBe(48);
    expect(tapFor("xp", "action")).toBe(24);
    expect(tapFor("xp", "primary")).toBe(24);
  });
  it("exposes the scale", () => {
    expect(TAP).toEqual({ xp: 24, min: 44, std: 48, pri: 56, pos: 64 });
  });
});
