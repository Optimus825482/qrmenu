"use server";

import { z } from "zod";
import type { OrderStatus } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { safeAction } from "@/lib/result";
import { approvals } from "../approvals";
import { orders } from "../orders";

const OPEN: OrderStatus[] = ["GONDERILDI", "ONAYLANDI", "HAZIR"];

export type PanelOrder = {
  id: string;
  orderNo: number;
  status: OrderStatus;
  createdAt: string;
  note: string | null;
  pricesShown: boolean;
  canApprove: boolean;
  items: { id: string; name: string; qty: number; unitPrice: number | null }[];
};

const input = z.object({ outletId: z.string().min(1), tableId: z.string().min(1) });

/**
 * POS yan paneli: bir masanın açık siparişleri (kalemleriyle). Mevcut `orders.listForOutlet`
 * (yetki + outlet kapsamı) ve `approvals.canApproveOrder` kullanılır; yeni yazma yoktur.
 */
export async function tablePanelOrdersAction(outletId: string, tableId: string) {
  return safeAction(input, async (value): Promise<PanelOrder[]> => {
    const ctx = await requireUser();
    const rows = (await orders.listForOutlet(ctx, value.outletId, { statuses: OPEN })).filter((order) => order.tableId === value.tableId);
    return Promise.all(
      rows
        .slice()
        .reverse()
        .map(async (order) => ({
          id: order.id,
          orderNo: order.orderNo,
          status: order.status,
          createdAt: order.createdAt.toISOString(),
          note: order.noteTr ?? order.note,
          pricesShown: order.pricesShown,
          canApprove: order.status === "GONDERILDI" && (await approvals.canApproveOrder(ctx, order)),
          items: order.items.map((item) => ({
            id: item.id,
            name: item.nameSnapshot,
            qty: item.qty,
            unitPrice: item.unitPrice === null ? null : Number(item.unitPrice),
          })),
        })),
    );
  })({ outletId, tableId });
}
