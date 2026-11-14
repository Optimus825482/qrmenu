import { describe, expect, it } from "vitest";
import { IDLE_BEFORE_RELOAD_MS, staleBuildShouldReload } from "@/shell/staleBuildReload";

const base = { clientBuildId: "old", serverBuildId: "new", reloadedFor: null, idleMs: IDLE_BEFORE_RELOAD_MS, editing: false };

describe("staleBuildShouldReload", () => {
  it("reloads an idle page when the server runs another build", () => {
    expect(staleBuildShouldReload(base)).toBe(true);
  });

  it("does nothing when the build is the same or unknown", () => {
    expect(staleBuildShouldReload({ ...base, serverBuildId: "old" })).toBe(false);
    expect(staleBuildShouldReload({ ...base, serverBuildId: undefined })).toBe(false);
  });

  it("reloads at most once per server build", () => {
    expect(staleBuildShouldReload({ ...base, reloadedFor: "new" })).toBe(false);
    expect(staleBuildShouldReload({ ...base, reloadedFor: "older" })).toBe(true);
  });

  it("waits while someone is using the page", () => {
    expect(staleBuildShouldReload({ ...base, idleMs: IDLE_BEFORE_RELOAD_MS - 1 })).toBe(false);
    expect(staleBuildShouldReload({ ...base, editing: true })).toBe(false);
  });
});
