import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineReport, fetchCap, type ReportRow } from "@/modules/reporting/server/types";
import { min1 } from "./util";

const STATES = ["hepsi", "tukenik", "acildi"] as const;
type Params = { state: (typeof STATES)[number] };

/** What `menuTree.setAvailable` writes to the audit log (older rows carry `isAvailable` only). */
type After = { isAvailable?: unknown; name?: unknown; outletId?: unknown } | null;
const afterOf = (value: unknown): After => (value && typeof value === "object" ? (value as After) : null);

/**
 * Room-service items marked sold out, read from the audit log (`MENU_NODE_AVAILABILITY`): one row per
 * marking in the date range, paired with the first "put back" that follows it (also when that falls after
 * the range). A marking nobody undid yet is "Tükenik" and has no duration.
 */
export const rsTukenen = defineReport<Params>({
  key: "rs-tukenen",
  group: "ROOM_SERVICE",
  title: "Oda Servisi Tükenen Ürünler",
  description: "Tükendi işaretlenen oda servisi ürünleri: kim, ne zaman işaretledi, ne zaman yeniden açıldı ve ne kadar süre menüde yoktu",
  moduleKey: "ROOM_SERVICE",
  screenCode: "RO-SLA",
  dateMode: "range",
  outletScoped: true,
  paramFields: [
    {
      name: "state",
      label: "Durum",
      type: "select",
      default: "hepsi",
      options: [
        { value: "hepsi", label: "Hepsi" },
        { value: "tukenik", label: "Hâlâ tükenik" },
        { value: "acildi", label: "Yeniden açılan" },
      ],
    },
  ],
  paramsSchema: z.object({ state: z.enum(STATES).default("hepsi") }),
  async run(scope, params) {
    const base = { action: "MENU_NODE_AVAILABILITY", entity: "MenuNode", hotelId: { in: scope.hotelIds } } as const;
    const select = {
      entityId: true,
      createdAt: true,
      after: true,
      hotelId: true,
      user: { select: { fullName: true } },
    } as const;
    const marked = (
      await prisma.auditLog.findMany({
        where: { ...base, createdAt: { gte: scope.start, lt: scope.end }, after: { path: ["isAvailable"], equals: false } },
        select,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      })
    ).filter((row) => row.entityId !== null);
    const nodeIds = [...new Set(marked.map((row) => row.entityId as string))];

    const [restored, nodes, parents, hotels] = await Promise.all([
      prisma.auditLog.findMany({
        where: { ...base, entityId: { in: nodeIds }, createdAt: { gte: scope.start }, after: { path: ["isAvailable"], equals: true } },
        select,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
      prisma.menuNode.findMany({
        where: { id: { in: nodeIds } },
        select: { id: true, name: true, price: true, parentId: true, outletId: true },
      }),
      prisma.menuNode.findMany({
        where: { outlet: { hotelId: { in: scope.hotelIds }, type: "ODA_SERVISI" }, kind: { not: "OGE" } },
        select: { id: true, name: true, parentId: true },
      }),
      prisma.hotel.findMany({ where: { id: { in: scope.hotelIds } }, select: { id: true, name: true } }),
    ]);
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const outletIdOf = (row: (typeof marked)[number]): string | undefined => {
      const fromAudit = afterOf(row.after)?.outletId;
      return nodeById.get(row.entityId as string)?.outletId ?? (typeof fromAudit === "string" ? fromAudit : undefined);
    };
    const outletIds = [...new Set(marked.map(outletIdOf).filter((id): id is string => Boolean(id)))];
    const outlets = await prisma.outlet.findMany({
      where: { id: { in: scope.outletId ? outletIds.filter((id) => id === scope.outletId) : outletIds }, type: "ODA_SERVISI" },
      select: { id: true },
    });
    const roomServiceOutlets = new Set(outlets.map((o) => o.id));

    const parentById = new Map(parents.map((p) => [p.id, p]));
    const pathOf = (parentId: string | null | undefined): string => {
      const names: string[] = [];
      for (let id = parentId, guard = 0; id && guard < 10; guard++) {
        const node = parentById.get(id);
        if (!node) break;
        names.unshift(node.name);
        id = node.parentId;
      }
      return names.join(" › ");
    };
    const hotelName = new Map(hotels.map((h) => [h.id, h.name]));
    const restoredByNode = new Map<string, typeof restored>();
    for (const row of restored) {
      const list = restoredByNode.get(row.entityId as string) ?? [];
      list.push(row);
      restoredByNode.set(row.entityId as string, list);
    }

    const all: ReportRow[] = [];
    for (const row of marked) {
      const outletId = outletIdOf(row);
      if (!outletId || !roomServiceOutlets.has(outletId)) continue;
      const nodeId = row.entityId as string;
      const node = nodeById.get(nodeId);
      const back = restoredByNode.get(nodeId)?.find((r) => r.createdAt > row.createdAt);
      if (params.state === "tukenik" && back) continue;
      if (params.state === "acildi" && !back) continue;
      const auditName = afterOf(row.after)?.name;
      all.push({
        soldOutAt: row.createdAt,
        hotel: hotelName.get(row.hotelId ?? "") ?? "",
        path: pathOf(node?.parentId),
        item: node?.name ?? (typeof auditName === "string" ? auditName : "(silinmiş ürün)"),
        price: node?.price == null ? null : Number(node.price),
        by: row.user?.fullName ?? "",
        state: back ? "Yeniden açıldı" : "Tükenik",
        restoredAt: back?.createdAt ?? null,
        restoredBy: back?.user?.fullName ?? "",
        minutes: back ? min1((back.createdAt.getTime() - row.createdAt.getTime()) / 60_000) : null,
      });
    }
    const truncated = all.length > scope.limit;
    const rows = all.slice(0, fetchCap(scope));
    const durations = all.map((r) => r.minutes).filter((m): m is number => typeof m === "number");
    return {
      columns: [
        { key: "soldOutAt", title: "Tükendi işaretlendi", type: "datetime" },
        { key: "hotel", title: "Otel", type: "text", width: 22 },
        { key: "path", title: "Kategori", type: "text", width: 30 },
        { key: "item", title: "Ürün", type: "text", width: 28 },
        { key: "price", title: "Fiyat", type: "money" },
        { key: "by", title: "İşaretleyen", type: "text", width: 22 },
        { key: "state", title: "Durum", type: "text" },
        { key: "restoredAt", title: "Yeniden açıldı", type: "datetime" },
        { key: "restoredBy", title: "Açan", type: "text", width: 22 },
        { key: "minutes", title: "Menüde yok (dk)", type: "minutes" },
      ],
      rows,
      summary: [
        { label: "Tükendi işaretleme", value: all.length },
        { label: "Hâlâ tükenik", value: all.filter((r) => r.state === "Tükenik").length },
        { label: "Yeniden açılan", value: durations.length },
        ...(durations.length ? [{ label: "Ort. menüde yok (dk)", value: min1(durations.reduce((a, m) => a + m, 0) / durations.length)! }] : []),
      ],
      truncated,
    };
  },
});
