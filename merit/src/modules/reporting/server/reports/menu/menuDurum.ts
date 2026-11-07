import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { defineReport, fetchCap, type ReportRow } from "@/modules/reporting/server/types";

const LANGS = ["en", "de", "ru", "ar"] as const;
const ISSUES = ["hepsi", "tukendi", "pasif", "fotografsiz", "ceviri-eksik"] as const;
type Params = { issue: (typeof ISSUES)[number] };

/** One row per menu item (OGE) with its category path; the tree is built in memory per outlet. */
export const menuDurum = defineReport<Params>({
  key: "menu-durum",
  group: "QR_MENU",
  title: "Menü Durumu",
  description: "Menü öğelerinin fiyat, durum, fotoğraf, çeviri ve alerjen bilgisi",
  moduleKey: "QR_MENU",
  screenCode: "QM-RAP",
  dateMode: "none",
  outletScoped: true,
  paramFields: [
    {
      name: "issue",
      label: "Sorun",
      type: "select",
      default: "hepsi",
      options: [
        { value: "hepsi", label: "Hepsi" },
        { value: "tukendi", label: "Tükenen" },
        { value: "pasif", label: "Pasif" },
        { value: "fotografsiz", label: "Fotoğrafsız" },
        { value: "ceviri-eksik", label: "Çevirisi eksik" },
      ],
    },
  ],
  paramsSchema: z.object({ issue: z.enum(ISSUES).default("hepsi") }),
  async run(scope, params) {
    const outletWhere: Prisma.MenuNodeWhereInput = {
      outlet: { hotelId: { in: scope.hotelIds } },
      ...(scope.outletId ? { outletId: scope.outletId } : {}),
    };
    const issueWhere: Prisma.MenuNodeWhereInput =
      params.issue === "tukendi"
        ? { isAvailable: false }
        : params.issue === "pasif"
          ? { isActive: false }
          : params.issue === "fotografsiz"
            ? { imageUrl: null, imageUrls: { isEmpty: true } }
            : params.issue === "ceviri-eksik"
              ? { OR: LANGS.map((lang) => ({ translations: { none: { lang } } })) }
              : {};
    const [items, parents] = await Promise.all([
      prisma.menuNode.findMany({
        where: { ...outletWhere, kind: "OGE", ...issueWhere },
        orderBy: [
          { outlet: { hotel: { name: "asc" } } },
          { outlet: { name: "asc" } },
          { sortOrder: "asc" },
          { name: "asc" },
          { id: "asc" },
        ],
        take: fetchCap(scope),
        select: {
          name: true,
          price: true,
          isActive: true,
          isAvailable: true,
          imageUrl: true,
          imageUrls: true,
          allergens: true,
          parentId: true,
          outlet: { select: { name: true, hotel: { select: { name: true } } } },
          translations: { select: { lang: true } },
        },
      }),
      prisma.menuNode.findMany({
        where: { ...outletWhere, kind: { not: "OGE" } },
        select: { id: true, name: true, parentId: true },
      }),
    ]);
    const byId = new Map(parents.map((p) => [p.id, p]));
    const pathOf = (parentId: string | null): string => {
      const names: string[] = [];
      for (let id = parentId, guard = 0; id && guard < 10; guard++) {
        const node = byId.get(id);
        if (!node) break;
        names.unshift(node.name);
        id = node.parentId;
      }
      return names.join(" › ");
    };
    const rows: ReportRow[] = items.map((n) => {
      const have = new Set(n.translations.map((t) => t.lang));
      return {
        hotel: n.outlet.hotel.name,
        outlet: n.outlet.name,
        path: pathOf(n.parentId),
        item: n.name,
        price: n.price === null ? null : Number(n.price),
        status: n.isActive ? "Aktif" : "Pasif",
        soldOut: n.isAvailable ? "Hayır" : "Evet",
        photo: n.imageUrl || n.imageUrls.length > 0 ? "Var" : "Yok",
        missing: LANGS.filter((l) => !have.has(l)).join(", "),
        allergens: n.allergens.join(", "),
      };
    });
    const count = (f: (r: ReportRow) => boolean) => rows.filter(f).length;
    return {
      columns: [
        { key: "hotel", title: "Otel", type: "text", width: 22 },
        { key: "outlet", title: "Outlet", type: "text", width: 22 },
        { key: "path", title: "Yol (Kategori › Alt › Grup)", type: "text", width: 36 },
        { key: "item", title: "Öğe", type: "text", width: 28 },
        { key: "price", title: "Fiyat", type: "money" },
        { key: "status", title: "Durum", type: "text" },
        { key: "soldOut", title: "Tükendi", type: "text" },
        { key: "photo", title: "Fotoğraf", type: "text" },
        { key: "missing", title: "Eksik çeviri", type: "text" },
        { key: "allergens", title: "Alerjen", type: "text", width: 24 },
      ],
      rows,
      summary: [
        { label: "Öğe", value: rows.length },
        { label: "Pasif", value: count((r) => r.status === "Pasif") },
        { label: "Tükenen", value: count((r) => r.soldOut === "Evet") },
        { label: "Fotoğrafsız", value: count((r) => r.photo === "Yok") },
        { label: "Çevirisi eksik", value: count((r) => r.missing !== "") },
      ],
      truncated: false,
    };
  },
});
