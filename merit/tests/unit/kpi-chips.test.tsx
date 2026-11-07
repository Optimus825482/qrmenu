// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";
import type { KpiResponse } from "@/modules/reporting/server/radar/kpi";

const radarMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/reporting/server/actions/radar", () => ({ radarAction: radarMock }));

const listeners = vi.hoisted(() => new Set<(e: unknown) => void>());
vi.mock("@/shell/sseStore", () => ({
  sseClient: () => ({
    subscribe: (l: (e: unknown) => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  }),
}));

const { KpiChips } = await import("@/modules/reporting/ui/KpiChips");
const { useRadarKpi } = await import("@/modules/reporting/ui/useRadarKpi");

const metric = (key: string, label: string, value: number, severity: "ok" | "warn" | "crit", unit?: string, screenCode = "MB-KAT") => ({
  key,
  label,
  value,
  severity,
  ...(unit ? { unit } : {}),
  screenCode,
});

const response = (over: Partial<KpiResponse> = {}): KpiResponse =>
  ({
    generatedAt: "2026-11-07T10:00:00Z",
    scope: "total",
    hotels: [
      { hotelId: "h1", code: "MR", name: "Merit Royal", metrics: [] },
      { hotelId: "h2", code: "MP", name: "Merit Park", metrics: [] },
    ],
    totals: {
      mybarPending: metric("mybarPending", "Bekleyen MyBar", 2, "crit"),
      consumptionToday: metric("consumptionToday", "Bugünkü tüketim", 1234, "ok", "adet", "MB-RAP"),
      taskCompletionPct: metric("taskCompletionPct", "Görev tamamlanma", 85, "warn", "%", "MB-RAP"),
    },
    ...over,
  }) as unknown as KpiResponse;

function Harness({ onOpen, canOpen }: { onOpen?: (c: string) => void; canOpen?: (c: string) => boolean }) {
  const k = useRadarKpi();
  return (
    <KpiChips
      data={k.data}
      error={k.error}
      stale={k.stale}
      choice={k.choice}
      hotels={k.hotels}
      onScopeChange={k.selectScope}
      onOpen={onOpen}
      canOpen={canOpen}
    />
  );
}

const emit = (type: string) => act(() => void listeners.forEach((l) => l({ type, at: "2026-11-07T10:00:00Z" } as MeritEvent)));
const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

beforeEach(() => {
  vi.useFakeTimers();
  listeners.clear();
  radarMock.mockReset();
  radarMock.mockResolvedValue({ ok: true, data: response() });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("KpiChips", () => {
  it("renders only permitted metrics, with severity text, classes and unit formatting", async () => {
    render(<Harness />);
    await flush();
    expect(screen.getByTestId("kpi-chip-mybarPending")).toBeTruthy();
    expect(screen.queryByTestId("kpi-chip-printFailed")).toBeNull();
    expect(screen.getByTestId("kpi-chip-mybarPending").textContent).toContain("Kritik");
    expect(screen.getByTestId("kpi-chip-mybarPending").innerHTML).toContain("bg-danger/10 text-danger");
    expect(screen.getByTestId("kpi-chip-taskCompletionPct").innerHTML).toContain("bg-warn/10 text-warn");
    expect(screen.getByTestId("kpi-chip-consumptionToday").innerHTML).toContain("bg-success/10 text-success");
    expect(screen.getByTestId("kpi-chip-value-taskCompletionPct").textContent).toBe("%85");
    expect(screen.getByTestId("kpi-chip-value-consumptionToday").textContent).toBe(new Intl.NumberFormat("tr-TR").format(1234));
  });

  it("opens the screen only when permitted", async () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} canOpen={(c) => c === "MB-KAT"} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /Bekleyen MyBar/ }));
    expect(onOpen).toHaveBeenCalledWith("MB-KAT");
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("scope switch calls the action with the right input and hides for one hotel", async () => {
    render(<Harness />);
    await flush();
    expect(radarMock).toHaveBeenLastCalledWith({ scope: "total" });
    fireEvent.change(screen.getByTestId("kpi-scope"), { target: { value: "hotel:h2" } });
    await flush();
    expect(radarMock).toHaveBeenLastCalledWith({ scope: "hotel", hotelId: "h2" });
    fireEvent.change(screen.getByTestId("kpi-scope"), { target: { value: "total" } });
    await flush();
    expect(radarMock).toHaveBeenLastCalledWith({ scope: "total" });
  });

  it("has no scope switch for a single hotel", async () => {
    radarMock.mockResolvedValue({ ok: true, data: response({ hotels: [{ hotelId: "h1", code: "MR", name: "Merit Royal", metrics: [] }] }) });
    render(<Harness />);
    await flush();
    expect(screen.queryByTestId("kpi-scope")).toBeNull();
  });
});

describe("useRadarKpi refresh", () => {
  it("collapses a burst of SSE events into one refresh and ignores unrelated ones", async () => {
    render(<Harness />);
    await flush();
    expect(radarMock).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i++) emit("mybar.created");
    emit("presence.tick");
    await advance(500);
    expect(radarMock).toHaveBeenCalledTimes(1);
    await advance(600);
    expect(radarMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes on realtime.resync", async () => {
    render(<Harness />);
    await flush();
    emit("realtime.resync");
    await advance(1100);
    expect(radarMock).toHaveBeenCalledTimes(2);
  });

  it("polls every 60 s as fallback", async () => {
    render(<Harness />);
    await flush();
    await advance(59_000);
    expect(radarMock).toHaveBeenCalledTimes(1);
    await advance(1_500);
    expect(radarMock).toHaveBeenCalledTimes(2);
  });

  it("shows the stale badge after 2x fallback without a successful refresh, and clears it on recovery", async () => {
    render(<Harness />);
    await flush();
    expect(screen.queryByTestId("kpi-stale")).toBeNull();
    radarMock.mockResolvedValue({ ok: false, error: { code: "INTERNAL", message: "Hata" } });
    await advance(135_000);
    expect(screen.getByTestId("kpi-stale")).toBeTruthy();
    radarMock.mockResolvedValue({ ok: true, data: response() });
    await advance(60_000);
    expect(screen.queryByTestId("kpi-stale")).toBeNull();
  });
});
