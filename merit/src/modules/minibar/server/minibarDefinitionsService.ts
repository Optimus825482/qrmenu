import { prisma } from "@/lib/prisma";
import { audit } from "@/modules/core/server/audit";

export interface UserAuditCtx {
  userId?: string;
  hotelId?: string;
  ip?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ÜRÜN GRUBU (ProductGroup) CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function listProductGroups() {
  const groups = await prisma.productGroup.findMany({
    include: {
      _count: {
        select: { products: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    isActive: g.isActive,
    productCount: g._count.products,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  }));
}

export async function createProductGroup(
  data: { name: string; description?: string; isActive?: boolean },
  ctx: UserAuditCtx
) {
  const name = data.name.trim();
  if (!name) throw new Error("Ürün grubu adı zorunludur.");

  const existing = await prisma.productGroup.findUnique({ where: { name } });
  if (existing) throw new Error(`"${name}" adında bir ürün grubu zaten mevcut.`);

  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.productGroup.create({
      data: {
        name,
        description: data.description?.trim() || null,
        isActive: data.isActive ?? true,
      },
    });

    await audit(tx, {
      userId: ctx.userId,
      hotelId: ctx.hotelId,
      action: "CREATE",
      entity: "ProductGroup",
      entityId: created.id,
      after: created,
      ip: ctx.ip,
    });

    return created;
  });

  return group;
}

export async function updateProductGroup(
  id: string,
  data: { name?: string; description?: string | null; isActive?: boolean },
  ctx: UserAuditCtx
) {
  const existing = await prisma.productGroup.findUnique({ where: { id } });
  if (!existing) throw new Error("Ürün grubu bulunamadı.");

  const name = data.name?.trim();
  if (name && name !== existing.name) {
    const duplicate = await prisma.productGroup.findUnique({ where: { name } });
    if (duplicate && duplicate.id !== id) {
      throw new Error(`"${name}" adında başka bir ürün grubu zaten mevcut.`);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.productGroup.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    await audit(tx, {
      userId: ctx.userId,
      hotelId: ctx.hotelId,
      action: "UPDATE",
      entity: "ProductGroup",
      entityId: id,
      before: existing,
      after: res,
      ip: ctx.ip,
    });

    return res;
  });

  return updated;
}

export async function deleteProductGroup(id: string, ctx: UserAuditCtx) {
  const existing = await prisma.productGroup.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!existing) throw new Error("Ürün grubu bulunamadı.");

  if (existing._count.products > 0) {
    throw new Error(
      `Bu ürün grubuna bağlı ${existing._count.products} adet ürün bulunmaktadır. Önce ürünleri silin veya başka gruba taşıyın.`
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.productGroup.delete({ where: { id } });

    await audit(tx, {
      userId: ctx.userId,
      hotelId: ctx.hotelId,
      action: "DELETE",
      entity: "ProductGroup",
      entityId: id,
      before: existing,
      ip: ctx.ip,
    });
  });

  return { success: true, message: `"${existing.name}" ürün grubu başarıyla silindi.` };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ÜRÜN (Product) CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function listProducts(filter?: { groupId?: string; search?: string; isActive?: boolean }) {
  const where: Record<string, unknown> = {};

  if (filter?.groupId) {
    where.groupId = filter.groupId;
  }
  if (filter?.isActive !== undefined) {
    where.isActive = filter.isActive;
  }
  if (filter?.search) {
    where.OR = [
      { name: { contains: filter.search, mode: "insensitive" } },
      { code: { contains: filter.search, mode: "insensitive" } },
      { barcode: { contains: filter.search, mode: "insensitive" } },
    ];
  }

  const products = await prisma.product.findMany({
    where,
    include: {
      group: { select: { id: true, name: true } },
      _count: {
        select: {
          setupItems: true,
          stocks: true,
        },
      },
    },
    orderBy: [{ group: { name: "asc" } }, { name: "asc" }],
  });

  return products.map((p) => ({
    id: p.id,
    groupId: p.groupId,
    groupName: p.group.name,
    code: p.code,
    name: p.name,
    barcode: p.barcode,
    unit: p.unit,
    criticalLevel: p.criticalLevel,
    purchasePrice: p.purchasePrice ? Number(p.purchasePrice) : null,
    salePrice: p.salePrice ? Number(p.salePrice) : null,
    isActive: p.isActive,
    setupItemCount: p._count.setupItems,
    hasStock: p._count.stocks > 0,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));
}

export async function createProduct(
  data: {
    groupId: string;
    code?: string | null;
    name: string;
    barcode?: string | null;
    unit?: string;
    criticalLevel?: number;
    purchasePrice?: number | null;
    salePrice?: number | null;
    isActive?: boolean;
  },
  ctx: UserAuditCtx
) {
  const name = data.name.trim();
  if (!name) throw new Error("Ürün adı zorunludur.");
  if (!data.groupId) throw new Error("Ürün grubu seçilmelidir.");

  const group = await prisma.productGroup.findUnique({ where: { id: data.groupId } });
  if (!group) throw new Error("Seçilen ürün grubu bulunamadı.");

  const code = data.code?.trim() || null;
  const barcode = data.barcode?.trim() || null;

  if (code) {
    const dupCode = await prisma.product.findUnique({ where: { code } });
    if (dupCode) throw new Error(`"${code}" kodlu başka bir ürün zaten mevcut.`);
  }

  if (barcode) {
    const dupBarcode = await prisma.product.findUnique({ where: { barcode } });
    if (dupBarcode) throw new Error(`"${barcode}" barkodlu başka bir ürün zaten mevcut.`);
  }

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        groupId: data.groupId,
        code,
        name,
        barcode,
        unit: data.unit?.trim() || "Adet",
        criticalLevel: typeof data.criticalLevel === "number" ? data.criticalLevel : 10,
        purchasePrice: data.purchasePrice !== undefined && data.purchasePrice !== null ? data.purchasePrice : null,
        salePrice: data.salePrice !== undefined && data.salePrice !== null ? data.salePrice : null,
        isActive: data.isActive ?? true,
      },
    });

    await audit(tx, {
      userId: ctx.userId,
      hotelId: ctx.hotelId,
      action: "CREATE",
      entity: "Product",
      entityId: created.id,
      after: created,
      ip: ctx.ip,
    });

    return created;
  });

  return product;
}

export async function updateProduct(
  id: string,
  data: {
    groupId?: string;
    code?: string | null;
    name?: string;
    barcode?: string | null;
    unit?: string;
    criticalLevel?: number;
    purchasePrice?: number | null;
    salePrice?: number | null;
    isActive?: boolean;
  },
  ctx: UserAuditCtx
) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new Error("Ürün bulunamadı.");

  const code = data.code !== undefined ? (data.code?.trim() || null) : existing.code;
  const barcode = data.barcode !== undefined ? (data.barcode?.trim() || null) : existing.barcode;

  if (code && code !== existing.code) {
    const dupCode = await prisma.product.findUnique({ where: { code } });
    if (dupCode && dupCode.id !== id) {
      throw new Error(`"${code}" kodlu başka bir ürün zaten mevcut.`);
    }
  }

  if (barcode && barcode !== existing.barcode) {
    const dupBarcode = await prisma.product.findUnique({ where: { barcode } });
    if (dupBarcode && dupBarcode.id !== id) {
      throw new Error(`"${barcode}" barkodlu başka bir ürün zaten mevcut.`);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.product.update({
      where: { id },
      data: {
        ...(data.groupId ? { groupId: data.groupId } : {}),
        ...(data.name ? { name: data.name.trim() } : {}),
        code,
        barcode,
        ...(data.unit ? { unit: data.unit.trim() } : {}),
        ...(typeof data.criticalLevel === "number" ? { criticalLevel: data.criticalLevel } : {}),
        ...(data.purchasePrice !== undefined ? { purchasePrice: data.purchasePrice } : {}),
        ...(data.salePrice !== undefined ? { salePrice: data.salePrice } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    await audit(tx, {
      userId: ctx.userId,
      hotelId: ctx.hotelId,
      action: "UPDATE",
      entity: "Product",
      entityId: id,
      before: existing,
      after: res,
      ip: ctx.ip,
    });

    return res;
  });

  return updated;
}

export async function deleteProduct(id: string, ctx: UserAuditCtx) {
  const existing = await prisma.product.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          setupItems: true,
          stocks: true,
          transactionItems: true,
        },
      },
    },
  });
  if (!existing) throw new Error("Ürün bulunamadı.");

  if (existing._count.transactionItems > 0 || existing._count.setupItems > 0) {
    // Geçmiş minibar işlemleri veya setup'larda yer alıyorsa silinemez, ancak pasife alınabilir
    const deactivated = await prisma.$transaction(async (tx) => {
      const res = await tx.product.update({
        where: { id },
        data: { isActive: false },
      });

      await audit(tx, {
        userId: ctx.userId,
        hotelId: ctx.hotelId,
        action: "DEACTIVATE",
        entity: "Product",
        entityId: id,
        before: existing,
        after: res,
        ip: ctx.ip,
      });

      return res;
    });

    return {
      success: true,
      message: `"${existing.name}" ürünü geçmiş işlemlerde ve setup içeriklerinde bulunduğu için silinmedi, pasif duruma getirildi.`,
      product: deactivated,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.product.delete({ where: { id } });

    await audit(tx, {
      userId: ctx.userId,
      hotelId: ctx.hotelId,
      action: "DELETE",
      entity: "Product",
      entityId: id,
      before: existing,
      ip: ctx.ip,
    });
  });

  return { success: true, message: `"${existing.name}" ürünü başarıyla silindi.` };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ODA TİPİ (RoomType) CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function listRoomTypes(hotelId: string) {
  const roomTypes = await prisma.roomType.findMany({
    where: { hotelId },
    include: {
      _count: {
        select: {
          rooms: true,
          setups: true,
        },
      },
      setups: {
        include: {
          setup: {
            select: { id: true, name: true, isInsideCabinet: true },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return roomTypes.map((rt) => ({
    id: rt.id,
    hotelId: rt.hotelId,
    name: rt.name,
    cabinetCount: rt.cabinetCount,
    isActive: rt.isActive,
    roomCount: rt._count.rooms,
    setupCount: rt._count.setups,
    assignedSetups: rt.setups.map((s) => ({
      setupId: s.setup.id,
      setupName: s.setup.name,
      isInsideCabinet: s.setup.isInsideCabinet,
      assignedAt: s.createdAt.toISOString(),
    })),
    createdAt: rt.createdAt.toISOString(),
    updatedAt: rt.updatedAt.toISOString(),
  }));
}

export async function createRoomType(
  data: { hotelId: string; name: string; cabinetCount?: number; isActive?: boolean },
  ctx: UserAuditCtx
) {
  const name = data.name.trim();
  if (!name) throw new Error("Oda tipi adı zorunludur.");
  if (!data.hotelId) throw new Error("Otel ID zorunludur.");

  const existing = await prisma.roomType.findUnique({
    where: {
      hotelId_name: { hotelId: data.hotelId, name },
    },
  });
  if (existing) throw new Error(`Bu otelde "${name}" adında bir oda tipi zaten mevcut.`);

  const created = await prisma.$transaction(async (tx) => {
    const res = await tx.roomType.create({
      data: {
        hotelId: data.hotelId,
        name,
        cabinetCount: typeof data.cabinetCount === "number" ? data.cabinetCount : 0,
        isActive: data.isActive ?? true,
      },
    });

    await audit(tx, {
      userId: ctx.userId,
      hotelId: data.hotelId,
      action: "CREATE",
      entity: "RoomType",
      entityId: res.id,
      after: res,
      ip: ctx.ip,
    });

    return res;
  });

  return created;
}

export async function updateRoomType(
  id: string,
  data: { name?: string; cabinetCount?: number; isActive?: boolean },
  ctx: UserAuditCtx
) {
  const existing = await prisma.roomType.findUnique({ where: { id } });
  if (!existing) throw new Error("Oda tipi bulunamadı.");

  const name = data.name?.trim();
  if (name && name !== existing.name) {
    const duplicate = await prisma.roomType.findUnique({
      where: { hotelId_name: { hotelId: existing.hotelId, name } },
    });
    if (duplicate && duplicate.id !== id) {
      throw new Error(`Bu otelde "${name}" adında başka bir oda tipi zaten var.`);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.roomType.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(typeof data.cabinetCount === "number" ? { cabinetCount: data.cabinetCount } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    await audit(tx, {
      userId: ctx.userId,
      hotelId: existing.hotelId,
      action: "UPDATE",
      entity: "RoomType",
      entityId: id,
      before: existing,
      after: res,
      ip: ctx.ip,
    });

    return res;
  });

  return updated;
}

export async function deleteRoomType(id: string, ctx: UserAuditCtx) {
  const existing = await prisma.roomType.findUnique({
    where: { id },
    include: { _count: { select: { rooms: true, setups: true } } },
  });
  if (!existing) throw new Error("Oda tipi bulunamadı.");

  if (existing._count.rooms > 0) {
    throw new Error(
      `Bu oda tipine bağlı ${existing._count.rooms} adet oda bulunmaktadır. Önce odaların tipini değiştiriniz.`
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.roomTypeSetup.deleteMany({ where: { roomTypeId: id } });
    await tx.roomType.delete({ where: { id } });

    await audit(tx, {
      userId: ctx.userId,
      hotelId: existing.hotelId,
      action: "DELETE",
      entity: "RoomType",
      entityId: id,
      before: existing,
      ip: ctx.ip,
    });
  });

  return { success: true, message: `"${existing.name}" oda tipi başarıyla silindi.` };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SETUP TANIMLAMA (Setup) CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function listSetups() {
  const setups = await prisma.setup.findMany({
    include: {
      _count: {
        select: {
          items: true,
          roomTypeSetups: true,
        },
      },
      items: {
        include: {
          product: {
            select: { id: true, name: true, unit: true, salePrice: true },
          },
        },
        orderBy: { product: { name: "asc" } },
      },
    },
    orderBy: { name: "asc" },
  });

  return setups.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    isInsideCabinet: s.isInsideCabinet,
    isActive: s.isActive,
    itemCount: s._count.items,
    roomTypeAssignmentCount: s._count.roomTypeSetups,
    totalNormItems: s.items.reduce((sum, it) => sum + it.qty, 0),
    items: s.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.product.name,
      unit: i.product.unit,
      salePrice: i.product.salePrice ? Number(i.product.salePrice) : 0,
      qty: i.qty,
    })),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));
}

export async function createSetup(
  data: { name: string; description?: string; isInsideCabinet?: boolean; isActive?: boolean },
  ctx: UserAuditCtx
) {
  const name = data.name.trim();
  if (!name) throw new Error("Setup adı zorunludur.");

  const existing = await prisma.setup.findUnique({ where: { name } });
  if (existing) throw new Error(`"${name}" adında bir setup zaten mevcut.`);

  const setup = await prisma.$transaction(async (tx) => {
    const created = await tx.setup.create({
      data: {
        name,
        description: data.description?.trim() || null,
        isInsideCabinet: data.isInsideCabinet ?? true,
        isActive: data.isActive ?? true,
      },
    });

    await audit(tx, {
      userId: ctx.userId,
      hotelId: ctx.hotelId,
      action: "CREATE",
      entity: "Setup",
      entityId: created.id,
      after: created,
      ip: ctx.ip,
    });

    return created;
  });

  return setup;
}

export async function updateSetup(
  id: string,
  data: { name?: string; description?: string | null; isInsideCabinet?: boolean; isActive?: boolean },
  ctx: UserAuditCtx
) {
  const existing = await prisma.setup.findUnique({ where: { id } });
  if (!existing) throw new Error("Setup bulunamadı.");

  const name = data.name?.trim();
  if (name && name !== existing.name) {
    const duplicate = await prisma.setup.findUnique({ where: { name } });
    if (duplicate && duplicate.id !== id) {
      throw new Error(`"${name}" adında başka bir setup zaten var.`);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.setup.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
        ...(data.isInsideCabinet !== undefined ? { isInsideCabinet: data.isInsideCabinet } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    await audit(tx, {
      userId: ctx.userId,
      hotelId: ctx.hotelId,
      action: "UPDATE",
      entity: "Setup",
      entityId: id,
      before: existing,
      after: res,
      ip: ctx.ip,
    });

    return res;
  });

  return updated;
}

export async function deleteSetup(id: string, ctx: UserAuditCtx) {
  const existing = await prisma.setup.findUnique({
    where: { id },
    include: { _count: { select: { roomTypeSetups: true, items: true } } },
  });
  if (!existing) throw new Error("Setup bulunamadı.");

  if (existing._count.roomTypeSetups > 0) {
    throw new Error(
      `Bu setup ${existing._count.roomTypeSetups} farklı oda tipine atanmış durumda. Önce oda tipi atamalarını kaldırınız.`
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.setupItem.deleteMany({ where: { setupId: id } });
    await tx.setup.delete({ where: { id } });

    await audit(tx, {
      userId: ctx.userId,
      hotelId: ctx.hotelId,
      action: "DELETE",
      entity: "Setup",
      entityId: id,
      before: existing,
      ip: ctx.ip,
    });
  });

  return { success: true, message: `"${existing.name}" setup'ı başarıyla silindi.` };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SETUP İÇERİK (SetupItem) CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function listSetupItems(setupId: string) {
  const items = await prisma.setupItem.findMany({
    where: { setupId },
    include: {
      product: {
        include: {
          group: { select: { name: true } },
        },
      },
    },
    orderBy: { product: { name: "asc" } },
  });

  return items.map((i) => ({
    id: i.id,
    setupId: i.setupId,
    productId: i.productId,
    productName: i.product.name,
    productCode: i.product.code,
    groupName: i.product.group.name,
    unit: i.product.unit,
    salePrice: i.product.salePrice ? Number(i.product.salePrice) : 0,
    qty: i.qty,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }));
}

export async function addOrUpdateSetupItem(
  data: { setupId: string; productId: string; qty: number },
  ctx: UserAuditCtx
) {
  if (data.qty <= 0) throw new Error("Setup norm miktarı 1 veya daha büyük olmalıdır.");

  const [setup, product] = await Promise.all([
    prisma.setup.findUnique({ where: { id: data.setupId } }),
    prisma.product.findUnique({ where: { id: data.productId } }),
  ]);

  if (!setup) throw new Error("Setup bulunamadı.");
  if (!product) throw new Error("Ürün bulunamadı.");

  const existing = await prisma.setupItem.findUnique({
    where: {
      setupId_productId: {
        setupId: data.setupId,
        productId: data.productId,
      },
    },
  });

  const result = await prisma.$transaction(async (tx) => {
    let item;
    if (existing) {
      item = await tx.setupItem.update({
        where: { id: existing.id },
        data: { qty: data.qty },
      });

      await audit(tx, {
        userId: ctx.userId,
        hotelId: ctx.hotelId,
        action: "UPDATE",
        entity: "SetupItem",
        entityId: item.id,
        before: { ...existing, productName: product.name, setupName: setup.name },
        after: { ...item, productName: product.name, setupName: setup.name },
        ip: ctx.ip,
      });
    } else {
      item = await tx.setupItem.create({
        data: {
          setupId: data.setupId,
          productId: data.productId,
          qty: data.qty,
        },
      });

      await audit(tx, {
        userId: ctx.userId,
        hotelId: ctx.hotelId,
        action: "CREATE",
        entity: "SetupItem",
        entityId: item.id,
        after: { ...item, productName: product.name, setupName: setup.name },
        ip: ctx.ip,
      });
    }

    return item;
  });

  return result;
}

export async function deleteSetupItem(id: string, ctx: UserAuditCtx) {
  const existing = await prisma.setupItem.findUnique({
    where: { id },
    include: { product: true, setup: true },
  });
  if (!existing) throw new Error("Setup ürün öğesi bulunamadı.");

  await prisma.$transaction(async (tx) => {
    await tx.setupItem.delete({ where: { id } });

    await audit(tx, {
      userId: ctx.userId,
      hotelId: ctx.hotelId,
      action: "DELETE",
      entity: "SetupItem",
      entityId: id,
      before: {
        id: existing.id,
        setupId: existing.setupId,
        setupName: existing.setup.name,
        productId: existing.productId,
        productName: existing.product.name,
        qty: existing.qty,
      },
      ip: ctx.ip,
    });
  });

  return { success: true, message: `"${existing.product.name}" setup içerisinden kaldırıldı.` };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. ODA TİPİNE GÖRE SETUP ATAMA (RoomTypeSetup) CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function listRoomTypeSetups(hotelId: string) {
  const assignments = await prisma.roomTypeSetup.findMany({
    where: { hotelId },
    include: {
      roomType: { select: { id: true, name: true } },
      setup: {
        select: {
          id: true,
          name: true,
          isInsideCabinet: true,
          _count: { select: { items: true } },
        },
      },
      hotel: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ roomType: { name: "asc" } }, { setup: { name: "asc" } }],
  });

  return assignments.map((a) => ({
    hotelId: a.hotelId,
    hotelName: a.hotel.name,
    roomTypeId: a.roomTypeId,
    roomTypeName: a.roomType.name,
    setupId: a.setupId,
    setupName: a.setup.name,
    isInsideCabinet: a.setup.isInsideCabinet,
    itemCount: a.setup._count.items,
    createdAt: a.createdAt.toISOString(),
  }));
}

export async function assignRoomTypeSetup(
  data: { hotelId: string; roomTypeId: string; setupId: string },
  ctx: UserAuditCtx
) {
  const [hotel, roomType, setup] = await Promise.all([
    prisma.hotel.findUnique({ where: { id: data.hotelId } }),
    prisma.roomType.findUnique({ where: { id: data.roomTypeId } }),
    prisma.setup.findUnique({ where: { id: data.setupId } }),
  ]);

  if (!hotel) throw new Error("Otel bulunamadı.");
  if (!roomType) throw new Error("Oda tipi bulunamadı.");
  if (!setup) throw new Error("Setup bulunamadı.");

  const existing = await prisma.roomTypeSetup.findUnique({
    where: {
      hotelId_roomTypeId_setupId: {
        hotelId: data.hotelId,
        roomTypeId: data.roomTypeId,
        setupId: data.setupId,
      },
    },
  });

  if (existing) {
    throw new Error(`"${roomType.name}" oda tipine "${setup.name}" setup'ı zaten atanmış.`);
  }

  const assigned = await prisma.$transaction(async (tx) => {
    const res = await tx.roomTypeSetup.create({
      data: {
        hotelId: data.hotelId,
        roomTypeId: data.roomTypeId,
        setupId: data.setupId,
      },
    });

    await audit(tx, {
      userId: ctx.userId,
      hotelId: data.hotelId,
      action: "ASSIGN_SETUP",
      entity: "RoomTypeSetup",
      entityId: `${data.hotelId}:${data.roomTypeId}:${data.setupId}`,
      after: {
        hotelName: hotel.name,
        roomTypeName: roomType.name,
        setupName: setup.name,
        ...res,
      },
      ip: ctx.ip,
    });

    return res;
  });

  return assigned;
}

export async function removeRoomTypeSetup(
  data: { hotelId: string; roomTypeId: string; setupId: string },
  ctx: UserAuditCtx
) {
  const existing = await prisma.roomTypeSetup.findUnique({
    where: {
      hotelId_roomTypeId_setupId: {
        hotelId: data.hotelId,
        roomTypeId: data.roomTypeId,
        setupId: data.setupId,
      },
    },
    include: {
      roomType: { select: { name: true } },
      setup: { select: { name: true } },
    },
  });

  if (!existing) throw new Error("Oda tipi setup ataması bulunamadı.");

  await prisma.$transaction(async (tx) => {
    await tx.roomTypeSetup.delete({
      where: {
        hotelId_roomTypeId_setupId: {
          hotelId: data.hotelId,
          roomTypeId: data.roomTypeId,
          setupId: data.setupId,
        },
      },
    });

    await audit(tx, {
      userId: ctx.userId,
      hotelId: data.hotelId,
      action: "UNASSIGN_SETUP",
      entity: "RoomTypeSetup",
      entityId: `${data.hotelId}:${data.roomTypeId}:${data.setupId}`,
      before: {
        roomTypeName: existing.roomType.name,
        setupName: existing.setup.name,
        ...existing,
      },
      ip: ctx.ip,
    });
  });

  return { success: true, message: `"${existing.roomType.name}" oda tipinden "${existing.setup.name}" setup ataması kaldırıldı.` };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. SİLİNEMEZ AUDIT LOG İNCELEME
// ─────────────────────────────────────────────────────────────────────────────

export async function listSystemAuditLogs(params?: {
  entity?: string;
  action?: string;
  hotelId?: string;
  limit?: number;
}) {
  const limit = Math.min(params?.limit || 100, 500);
  const where: Record<string, unknown> = {};

  if (params?.entity) where.entity = params.entity;
  if (params?.action) where.action = params.action;
  if (params?.hotelId) where.hotelId = params.hotelId;

  const logs = await prisma.auditLog.findMany({
    where,
    include: {
      user: { select: { fullName: true, username: true } },
      hotel: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return logs.map((l) => ({
    id: l.id,
    action: l.action,
    entity: l.entity,
    entityId: l.entityId,
    userName: l.user?.fullName || l.user?.username || "Sistem / Otomasyon",
    hotelName: l.hotel?.name || "-",
    before: l.before,
    after: l.after,
    ip: l.ip,
    createdAt: l.createdAt.toISOString(),
  }));
}
