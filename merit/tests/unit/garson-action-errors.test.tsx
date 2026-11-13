// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A refused action on the waiter screen (somebody else answered the call first, the order was already
// approved, the right is missing) must tell the waiter why, and reload the lists that turned out stale.

const approveOrder = vi.hoisted(() => vi.fn());
const markServed = vi.hoisted(() => vi.fn());
const rejectOrder = vi.hoisted(() => vi.fn());
const askReason = vi.hoisted(() => vi.fn());
const listQueue = vi.hoisted(() => vi.fn());
const clearTable = vi.hoisted(() => vi.fn());
const listOpenCalls = vi.hoisted(() => vi.fn());
const resolveCall = vi.hoisted(() => vi.fn());
const listMyOpenOrders = vi.hoisted(() => vi.fn());
const listMyTables = vi.hoisted(() => vi.fn());
vi.mock("@/modules/order/actions/orders", () => ({
  approveOrderAction: approveOrder,
  listQueueAction: listQueue,
  markServedAction: markServed,
  rejectOrderAction: rejectOrder,
}));
vi.mock("@/modules/order/actions/cashier", () => ({ clearTableAction: clearTable }));
vi.mock("@/modules/order/actions/calls", () => ({ listOpenCallsAction: listOpenCalls, resolveCallAction: resolveCall }));
vi.mock("@/modules/order/actions/assignments", () => ({
  listMyOpenOrdersAction: listMyOpenOrders,
  listMyTablesAction: listMyTables,
}));

const notifyError = vi.hoisted(() => vi.fn());
const notifySuccess = vi.hoisted(() => vi.fn());
vi.mock("@/shell/notify", () => ({ notify: { error: notifyError, success: notifySuccess } }));

const tab = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(tab.value),
}));
vi.mock("@/shell/useSse", () => ({ useSse: () => ({ status: "open" }) }));
vi.mock("@/components/ops/useSound", () => ({ useSound: () => vi.fn() }));
vi.mock("@/components/ops/opsNotification", () => ({ showOpsNotification: vi.fn() }));
vi.mock("@/components/ops/NotificationPermissionGate", () => ({ NotificationPermissionGate: () => null }));
vi.mock("@/components/guide/RoutineCard", () => ({ RoutineCard: () => null }));
vi.mock("@/modules/order/ui/StaffOrderComposer", () => ({ StaffOrderComposer: () => null }));
vi.mock("@/components/ui/reason", () => ({ askReason }));

import GarsonClient from "@/app/(ops)/garson/GarsonClient";

const refused = (message: string) => ({ ok: false as const, error: { code: "CONFLICT", message } });
const done = { ok: true as const, data: null };

const queue = [
  { id: "o1", orderNo: 7, createdAt: new Date(), note: null, pricesShown: false, canApprove: true, table: { label: "T1" }, items: [] },
];
const calls = [{ id: "c1", tableLabel: "T1", type: "GARSON", note: null, overdue: false }];
const tables = [{ tableId: "t1", label: "T1", isOccupied: true }];
const openOrders = [{ id: "o2", orderNo: 8, tableId: "t1", status: "HAZIR" }];

function renderGarson() {
  return render(
    <GarsonClient outletId="out1" queue={queue} tables={tables} calls={calls} openOrders={openOrders} canCreateOrder={false} currency="EUR" />,
  );
}

beforeEach(() => {
  tab.value = "";
  listQueue.mockResolvedValue({ ok: true, data: [] });
  listOpenCalls.mockResolvedValue({ ok: true, data: [] });
  listMyTables.mockResolvedValue({ ok: true, data: tables });
  listMyOpenOrders.mockResolvedValue({ ok: true, data: openOrders });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GarsonClient: refused actions", () => {
  it("shows the server's reason when answering a call is refused, and reloads the lists", async () => {
    resolveCall.mockResolvedValue(refused("Bu çağrı başka bir personel tarafından yanıtlandı"));
    renderGarson();
    fireEvent.click(screen.getByRole("button", { name: "Yanıtla" }));
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith("Bu çağrı başka bir personel tarafından yanıtlandı"));
    expect(notifySuccess).not.toHaveBeenCalled();
    // The call somebody else answered leaves the screen: the list is read again.
    await waitFor(() => expect(listOpenCalls).toHaveBeenCalledWith("out1"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Yanıtla" })).toBeNull());
  });

  it("shows the reason when approving an order is refused", async () => {
    approveOrder.mockResolvedValue(refused("Sipariş zaten onaylanmış"));
    renderGarson();
    fireEvent.click(screen.getByRole("button", { name: "Onayla" }));
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith("Sipariş zaten onaylanmış"));
  });

  it("reports a refused rejection once, not twice", async () => {
    askReason.mockResolvedValue("Ürün tükendi");
    rejectOrder.mockResolvedValue(refused("Sipariş zaten onaylanmış"));
    renderGarson();
    fireEvent.click(screen.getByRole("button", { name: "Reddet" }));
    await waitFor(() => expect(rejectOrder).toHaveBeenCalledWith("o1", "Ürün tükendi"));
    await waitFor(() => expect(listQueue).toHaveBeenCalled());
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifyError).toHaveBeenCalledWith("Sipariş zaten onaylanmış");
    expect(notifySuccess).not.toHaveBeenCalled();
  });

  it("shows the reason when clearing a table or marking an order served is refused", async () => {
    tab.value = "sekme=masalar";
    clearTable.mockResolvedValue(refused("Masada açık adisyon var"));
    markServed.mockResolvedValue(refused("Bu işlem için yetkiniz yok"));
    renderGarson();
    fireEvent.click(screen.getByRole("button", { name: "Boşa al" }));
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith("Masada açık adisyon var"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Servis edildi" })).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByRole("button", { name: "Servis edildi" }));
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith("Bu işlem için yetkiniz yok"));
    expect(notifySuccess).not.toHaveBeenCalled();
  });

  it("stays quiet about errors when the action succeeds", async () => {
    tab.value = "sekme=masalar";
    clearTable.mockResolvedValue(done);
    renderGarson();
    fireEvent.click(screen.getByRole("button", { name: "Boşa al" }));
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledWith("T1 boş duruma alındı"));
    expect(notifyError).not.toHaveBeenCalled();
  });
});
