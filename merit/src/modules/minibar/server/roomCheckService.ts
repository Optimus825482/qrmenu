import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { businessDate, businessDay } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";
import {
  assertWithinCatalogue,
  consumedToday,
  getBusinessDate,
  lockRow,
  normalizeItems,
  notifyChange,
  roomCatalogue,
} from "./minibarCommon";
import type { CorrectionRequestItem } from "./minibarTypes";
import { deductFromPool, returnToPool } from "./poolStock";

/**
 * 4. Oda Kontrolünü Tamamla & Sarfiyat / Dolum Kaydet
 *
 * One transaction: room row lock (serialises the checks of a room), setup catalogue + daily cap
 * validation, HotelStock FOR UPDATE deduction (never negative), movement rows referencing the
 * transaction, audit and a realtime notice. `clientRequestId` makes a retry return the first result.
 */
export async function submitRoomCheck(params: {
  hotelId: string;
  roomId: string;
  userId: string;
  consumedItems: { productId: string; qty: number; setupId?: string }[];
  note?: string;
  clientRequestId?: string;
}) {
  const { hotelId, roomId, userId, note, clientRequestId } = params;
  const lines = normalizeItems(params.consumedItems);
  const day = businessDate();
  const today = businessDay(day);

  return await prisma.$transaction(async (tx) => {
    await lockRow(tx, "rooms", roomId);
    const room = await tx.room.findFirst({
      where: { id: roomId, hotelId },
      select: { id: true, number: true, roomTypeId: true },
    });
    if (!room) throw new DomainError("NOT_FOUND", "Oda bulunamadı.");

    if (clientRequestId) {
      const prior = await tx.auditLog.findFirst({
        where: {
          action: "ROOM_CHECK_COMPLETE",
          entity: "MinibarTransaction",
          userId,
          hotelId,
          after: { path: ["clientRequestId"], equals: clientRequestId },
        },
        select: { entityId: true, after: true },
      });
      if (prior?.entityId) {
        const replenished = Number((prior.after as { totalReplenished?: number } | null)?.totalReplenished ?? 0);
        return { success: true, transactionId: prior.entityId, replenishedCount: replenished, replayed: true };
      }
    }

    const cat = await roomCatalogue(tx, hotelId, room.roomTypeId);
    const already = await consumedToday(tx, hotelId, roomId, day);
    assertWithinCatalogue(lines, cat, already);

    const totalReplenished = lines.reduce((acc, x) => acc + x.qty, 0);
    const txType = totalReplenished > 0 ? "SETUP_KONTROL" : "SARFIYAT_YOK";

    const minibarTx = await tx.minibarTransaction.create({
      data: {
        hotelId,
        roomId,
        userId,
        type: txType,
        note:
          note ||
          (totalReplenished > 0 ? `${totalReplenished} ürün eksik tamamlandı.` : "Sarfiyat yok, minibar tam."),
      },
    });

    if (lines.length > 0) {
      const products = await tx.product.findMany({
        where: { id: { in: lines.map((l) => l.productId) } },
        select: { id: true, purchasePrice: true, salePrice: true },
      });
      const priceOf = new Map(products.map((p) => [p.id, p]));
      for (const line of lines) {
        await tx.minibarTransactionItem.create({
          data: {
            transactionId: minibarTx.id,
            productId: line.productId,
            setupId: cat.setupOf.get(line.productId) ?? null,
            setupQty: cat.caps.get(line.productId) ?? 0,
            added: line.qty,
            consumed: line.qty,
            purchasePrice: priceOf.get(line.productId)?.purchasePrice ?? null,
            salePrice: priceOf.get(line.productId)?.salePrice ?? null,
          },
        });
      }
      await deductFromPool(
        tx,
        {
          hotelId,
          userId,
          type: "KULLANIM",
          refType: "MinibarTransaction",
          refId: minibarTx.id,
          note: `Oda kontrolü: Oda ${room.number}`,
        },
        lines,
      );
    }

    await tx.roomCheck.create({
      data: {
        roomId,
        userId,
        transactionId: minibarTx.id,
        checkDate: today,
        type: totalReplenished > 0 ? "URUN_EKLENDI" : "SARFIYAT_YOK",
        endedAt: new Date(),
      },
    });

    await audit(tx, {
      userId,
      hotelId,
      action: "ROOM_CHECK_COMPLETE",
      entity: "MinibarTransaction",
      entityId: minibarTx.id,
      after: {
        roomId,
        type: txType,
        totalReplenished,
        consumedItems: lines,
        note,
        clientRequestId: clientRequestId ?? null,
      },
    });

    await tx.dailyTaskItem.updateMany({
      where: { roomId, task: { hotelId, date: today } },
      data: { status: "TAMAMLANDI", checkedAt: new Date(), note: note || undefined },
    });

    await notifyChange(tx, hotelId, "room.check", roomId);

    return { success: true, transactionId: minibarTx.id, replenishedCount: totalReplenished, replayed: false };
  });
}

type CheckActor = {
  userId: string;
  hotelId: string;
  /** Holds MB-TUK 'A' (or is applying an approved correction): may touch other users' records. */
  canApprove: boolean;
  /** Approved correction of a past-dated record. */
  isManagerBypass?: boolean;
};

const PAST_DELETE =
  "Geçmiş tarihli kayıtlar kat sorumluları tarafından doğrudan silinemez. Yalnızca Depo Sorumlusu gerekçeli talep oluşturabilir ve Sistem Yöneticisi onayı ile işlem yapılabilir.";
const PAST_UPDATE =
  "Geçmiş tarihli kayıtlar kat sorumluları tarafından doğrudan değiştirilemez. Yalnızca Depo Sorumlusu gerekçeli talep oluşturabilir ve Sistem Yöneticisi onayı ile işlem yapılabilir.";

async function loadOwnTx(
  tx: Prisma.TransactionClient,
  transactionId: string,
  actor: CheckActor,
  pastMessage: string,
) {
  await lockRow(tx, "minibar_transactions", transactionId);
  const row = await tx.minibarTransaction.findFirst({
    where: { id: transactionId, hotelId: actor.hotelId },
    include: { items: true, room: { select: { id: true, number: true, roomTypeId: true } } },
  });
  if (!row) throw new DomainError("NOT_FOUND", "İşlem kaydı bulunamadı.");
  if (row.userId !== actor.userId && !actor.canApprove) {
    throw new DomainError("FORBIDDEN", "Yalnızca kaydı oluşturan kullanıcı veya yetkili onaycı değiştirebilir.");
  }
  const isToday = businessDate(row.occurredAt) === businessDate();
  if (!isToday && !actor.isManagerBypass) throw new DomainError("FORBIDDEN", pastMessage);
  return { row, isToday };
}

/** Delete inside an open transaction (used directly by the approved-correction flow). */
export async function deleteRoomCheckTx(
  tx: Prisma.TransactionClient,
  params: CheckActor & { transactionId: string },
) {
  const { transactionId, userId, hotelId } = params;
  const { row, isToday } = await loadOwnTx(tx, transactionId, params, PAST_DELETE);

  const returned = row.items.filter((i) => i.added > 0).map((i) => ({ productId: i.productId, qty: i.added }));
  await returnToPool(
    tx,
    {
      hotelId,
      userId,
      type: "IADE",
      refType: "MinibarTransaction",
      refId: row.id,
      note: `Oda ${row.room.number} kontrol kaydı iptal edildi, zimmete iade.`,
    },
    returned,
  );

  await tx.roomCheck.deleteMany({ where: { transactionId: row.id } });
  await tx.minibarTransactionItem.deleteMany({ where: { transactionId: row.id } });
  await tx.minibarTransaction.delete({ where: { id: row.id } });

  if (isToday) {
    await tx.dailyTaskItem.updateMany({
      where: { roomId: row.room.id, task: { hotelId, date: getBusinessDate() } },
      data: { status: "BEKLIYOR", checkedAt: null, note: null },
    });
  }

  await audit(tx, {
    userId,
    hotelId,
    action: "MINIBAR_ROOM_CHECK_DELETE",
    entity: "MinibarTransaction",
    entityId: row.id,
    before: {
      id: row.id,
      roomId: row.room.id,
      roomNumber: row.room.number,
      authorId: row.userId,
      occurredAt: row.occurredAt.toISOString(),
      items: row.items.map((i) => ({ productId: i.productId, added: i.added, consumed: i.consumed })),
      note: row.note,
      isManagerBypass: params.isManagerBypass ?? false,
    },
    after: null,
  });
  await notifyChange(tx, hotelId, "check.delete", row.room.id);

  return {
    success: true,
    message: `Oda ${row.room.number} kontrol kaydı silindi ve ${returned.reduce(
      (a, b) => a + b.qty,
      0,
    )} adet ürün zimmet stoğuna iade edildi.`,
  };
}

/**
 * 9. Aynı Gün İçerisinde Kaydı Sil (Ürünleri Zimmet Stoğuna İade Et)
 * Yalnızca kaydı oluşturan veya MB-TUK onay yetkisi olan kullanıcı.
 */
export async function deleteRoomCheckToday(params: CheckActor & { transactionId: string }) {
  return prisma.$transaction((tx) => deleteRoomCheckTx(tx, params));
}

type UpdateParams = CheckActor & {
  transactionId: string;
  updatedItems: { productId: string; qty: number }[];
  note?: string;
};

function normalizeKeepZero(items: { productId: string; qty: number }[]) {
  const merged = new Map<string, number>();
  for (const it of items) {
    if (!Number.isInteger(it.qty) || it.qty < 0) {
      throw new DomainError("VALIDATION", "Adet 0 veya pozitif tam sayı olmalı");
    }
    merged.set(it.productId, it.qty);
  }
  return [...merged.entries()].map(([productId, qty]) => ({ productId, qty }));
}

/** Update inside an open transaction. */
export async function updateRoomCheckTx(tx: Prisma.TransactionClient, params: UpdateParams) {
  const { transactionId, userId, hotelId, note } = params;
  const { row } = await loadOwnTx(tx, transactionId, params, PAST_UPDATE);
  const updatedItems = normalizeKeepZero(params.updatedItems);

  const cat = await roomCatalogue(tx, hotelId, row.room.roomTypeId);
  const already = await consumedToday(tx, hotelId, row.room.id, businessDate(row.occurredAt), row.id);
  assertWithinCatalogue(
    updatedItems.filter((i) => i.qty > 0),
    cat,
    already,
  );

  const oldItemsMap = new Map(row.items.map((i) => [i.productId, i]));
  const deduct: { productId: string; qty: number }[] = [];
  const back: { productId: string; qty: number }[] = [];
  for (const newItem of updatedItems) {
    const delta = newItem.qty - (oldItemsMap.get(newItem.productId)?.added ?? 0);
    if (delta > 0) deduct.push({ productId: newItem.productId, qty: delta });
    else if (delta < 0) back.push({ productId: newItem.productId, qty: -delta });
  }

  await returnToPool(
    tx,
    {
      hotelId,
      userId,
      type: "IADE",
      refType: "MinibarTransaction",
      refId: row.id,
      note: `Oda ${row.room.number} kaydı güncellendi (ürün azaltıldı/iade).`,
    },
    back,
  );
  await deductFromPool(
    tx,
    {
      hotelId,
      userId,
      type: "KULLANIM",
      refType: "MinibarTransaction",
      refId: row.id,
      note: `Oda ${row.room.number} kaydı güncellendi (ek ürün).`,
    },
    deduct,
  );

  const products = await tx.product.findMany({
    where: { id: { in: updatedItems.map((i) => i.productId) } },
    select: { id: true, purchasePrice: true, salePrice: true },
  });
  const priceOf = new Map(products.map((p) => [p.id, p]));
  for (const newItem of updatedItems) {
    const oldItem = oldItemsMap.get(newItem.productId);
    if (oldItem) {
      if (newItem.qty > 0) {
        await tx.minibarTransactionItem.update({
          where: { id: oldItem.id },
          data: { added: newItem.qty, consumed: newItem.qty },
        });
      } else {
        await tx.minibarTransactionItem.delete({ where: { id: oldItem.id } });
      }
    } else if (newItem.qty > 0) {
      await tx.minibarTransactionItem.create({
        data: {
          transactionId: row.id,
          productId: newItem.productId,
          setupId: cat.setupOf.get(newItem.productId) ?? null,
          setupQty: cat.caps.get(newItem.productId) ?? 0,
          added: newItem.qty,
          consumed: newItem.qty,
          purchasePrice: priceOf.get(newItem.productId)?.purchasePrice ?? null,
          salePrice: priceOf.get(newItem.productId)?.salePrice ?? null,
        },
      });
    }
  }

  const finalQty = new Map(row.items.map((i) => [i.productId, i.added]));
  for (const u of updatedItems) finalQty.set(u.productId, u.qty);
  const totalReplenished = [...finalQty.values()].reduce((a, b) => a + b, 0);
  const newTxType = totalReplenished > 0 ? "SETUP_KONTROL" : "SARFIYAT_YOK";

  await tx.minibarTransaction.update({
    where: { id: row.id },
    data: { type: newTxType, note: note !== undefined ? note : row.note },
  });

  await audit(tx, {
    userId,
    hotelId,
    action: "MINIBAR_ROOM_CHECK_UPDATE",
    entity: "MinibarTransaction",
    entityId: row.id,
    before: {
      id: row.id,
      roomId: row.room.id,
      roomNumber: row.room.number,
      type: row.type,
      authorId: row.userId,
      items: row.items.map((i) => ({ productId: i.productId, added: i.added, consumed: i.consumed })),
      note: row.note,
    },
    after: {
      type: newTxType,
      updatedItems,
      note: note !== undefined ? note : row.note,
      isManagerBypass: params.isManagerBypass ?? false,
    },
  });
  await notifyChange(tx, hotelId, "check.update", row.room.id);

  return { success: true, message: `Oda ${row.room.number} oda kontrol kaydı başarıyla güncellendi.` };
}

/**
 * 10. Aynı Gün İçerisinde Kaydı Güncelle (Stok Farkını Hesapla)
 */
export async function updateRoomCheckToday(params: UpdateParams) {
  return prisma.$transaction((tx) => updateRoomCheckTx(tx, params));
}

/**
 * 11. Geçmiş Tarihli Kayıt İçin Depo Sorumlusu Düzeltme / Silme Talebi Oluşturur
 */
export async function createPastDateCorrectionRequest(params: {
  transactionId: string;
  requestedById: string;
  hotelId: string;
  actionType: "SILME" | "DUZELTME";
  reason: string;
  proposedData?: Record<string, number>;
}) {
  const { transactionId, requestedById, hotelId, actionType, reason, proposedData } = params;

  if (!reason || reason.trim().length < 5) {
    throw new DomainError(
      "VALIDATION",
      "Lütfen geçmiş tarihli işlem için en az 5 karakterlik açıklama/gerekçe giriniz.",
    );
  }

  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "minibar_transactions", transactionId);
    const row = await tx.minibarTransaction.findFirst({
      where: { id: transactionId, hotelId },
      include: { room: true },
    });
    if (!row) {
      throw new DomainError("NOT_FOUND", "Düzeltme talep edilecek işlem kaydı bulunamadı.");
    }

    const pending = await tx.minibarCorrectionRequest.findFirst({
      where: { transactionId, status: "BEKLIYOR" },
    });
    if (pending) {
      throw new DomainError("CONFLICT", "Bu işlem için zaten onay bekleyen bir düzeltme talebi bulunmaktadır.");
    }

    const req = await tx.minibarCorrectionRequest.create({
      data: {
        hotelId,
        transactionId,
        requestedById,
        actionType,
        reason: reason.trim(),
        proposedData: proposedData ? JSON.parse(JSON.stringify(proposedData)) : undefined,
        status: "BEKLIYOR",
      },
    });

    await audit(tx, {
      userId: requestedById,
      hotelId,
      action: "MINIBAR_CORRECTION_REQUEST_CREATE",
      entity: "MinibarCorrectionRequest",
      entityId: req.id,
      before: null,
      after: {
        id: req.id,
        transactionId,
        roomNumber: row.room.number,
        actionType,
        reason: reason.trim(),
        proposedData,
        status: "BEKLIYOR",
      },
    });
    await notifyChange(tx, hotelId, "correction.request", row.roomId);

    return {
      success: true,
      requestId: req.id,
      message: `Oda ${row.room.number} için geçmiş tarihli ${
        actionType === "SILME" ? "silme" : "düzeltme"
      } talebi Sistem Yöneticisi onayına gönderildi.`,
    };
  });
}

/**
 * 12. Düzeltme Taleplerini Listele (Depo Sorumlusu & Sistem Yöneticisi İçin)
 */
export async function listCorrectionRequests(params: {
  hotelId: string;
  status?: "BEKLIYOR" | "ONAYLANDI" | "REDDEDILDI";
}): Promise<CorrectionRequestItem[]> {
  const { hotelId, status } = params;

  const requests = await prisma.minibarCorrectionRequest.findMany({
    where: {
      hotelId,
      ...(status ? { status } : {}),
    },
    include: {
      requestedBy: { select: { id: true, fullName: true } },
      approvedBy: { select: { id: true, fullName: true } },
      transaction: {
        include: {
          room: {
            include: { floor: { select: { name: true } } },
          },
          items: {
            include: { product: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return requests.map((r) => ({
    id: r.id,
    transactionId: r.transactionId,
    roomNumber: r.transaction?.room?.number || "Bilinmiyor",
    floorName: r.transaction?.room?.floor?.name || "-",
    occurredAt: r.transaction?.occurredAt?.toISOString() || r.createdAt.toISOString(),
    actionType: r.actionType,
    reason: r.reason,
    status: r.status,
    requestedById: r.requestedById,
    requestedByName: r.requestedBy.fullName,
    approvedById: r.approvedById,
    approvedByName: r.approvedBy?.fullName || null,
    proposedData: r.proposedData ? (r.proposedData as Record<string, number>) : null,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() || null,
    items: (r.transaction?.items || []).map((i) => ({
      productName: i.product.name,
      qty: i.added,
    })),
  }));
}

/**
 * 13. Düzeltme Talebini Sistem Yöneticisi Olarak Onayla veya Reddet
 *
 * One transaction: the request row is locked, the status checked, the correction applied and the
 * decision audited together. The requester can never approve their own request.
 */
export async function resolveCorrectionRequest(params: {
  requestId: string;
  approverId: string;
  hotelId: string;
  approved: boolean;
  rejectReason?: string;
}) {
  const { requestId, approverId, hotelId, approved, rejectReason } = params;

  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "minibar_correction_requests", requestId);
    const req = await tx.minibarCorrectionRequest.findFirst({
      where: { id: requestId, hotelId },
      include: { transaction: { include: { room: true } } },
    });
    if (!req) throw new DomainError("NOT_FOUND", "Düzeltme talebi bulunamadı.");
    if (req.status !== "BEKLIYOR") {
      throw new DomainError("CONFLICT", `Bu talep zaten önceden ${req.status.toLowerCase()} yapılmıştır.`);
    }
    if (req.requestedById === approverId) {
      throw new DomainError("FORBIDDEN", "Kendi oluşturduğunuz talebi onaylayamazsınız.");
    }

    const roomNumber = req.transaction?.room?.number || "";
    const resolvedAt = new Date();

    if (approved) {
      await tx.minibarCorrectionRequest.update({
        where: { id: req.id },
        data: { status: "ONAYLANDI", approvedById: approverId, resolvedAt },
      });

      const actor = { userId: req.requestedById, hotelId, canApprove: true, isManagerBypass: true };
      if (req.actionType === "SILME" && req.transactionId) {
        await deleteRoomCheckTx(tx, { ...actor, transactionId: req.transactionId });
      } else if (req.actionType === "DUZELTME" && req.transactionId && req.proposedData) {
        const proposedMap = req.proposedData as Record<string, number>;
        await updateRoomCheckTx(tx, {
          ...actor,
          transactionId: req.transactionId,
          updatedItems: Object.entries(proposedMap).map(([productId, qty]) => ({ productId, qty: Number(qty) })),
        });
      }

      await audit(tx, {
        userId: approverId,
        hotelId,
        action: "MINIBAR_CORRECTION_APPROVE",
        entity: "MinibarCorrectionRequest",
        entityId: req.id,
        before: { status: "BEKLIYOR" },
        after: { status: "ONAYLANDI", actionType: req.actionType, roomNumber, resolvedAt: resolvedAt.toISOString() },
      });
      await notifyChange(tx, hotelId, "correction.resolve");

      return {
        success: true,
        message: `Oda ${roomNumber} için talep Sistem Yöneticisi tarafından onaylandı ve uygulandı.`,
      };
    }

    const reason = rejectReason || "Yönetici tarafından onaylanmadı.";
    await tx.minibarCorrectionRequest.update({
      where: { id: req.id },
      data: { status: "REDDEDILDI", approvedById: approverId, rejectReason: reason, resolvedAt },
    });
    await audit(tx, {
      userId: approverId,
      hotelId,
      action: "MINIBAR_CORRECTION_REJECT",
      entity: "MinibarCorrectionRequest",
      entityId: req.id,
      before: { status: "BEKLIYOR" },
      after: { status: "REDDEDILDI", rejectReason: reason, roomNumber, resolvedAt: resolvedAt.toISOString() },
    });
    await notifyChange(tx, hotelId, "correction.resolve");

    return { success: true, message: `Oda ${roomNumber} için talep reddedildi.` };
  });
}
