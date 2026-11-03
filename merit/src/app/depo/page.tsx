import Link from "next/link";
import type { Metadata } from "next";
import { Icon, type IconName } from "@/components/icons/Icon";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { businessDate, TZ } from "@/lib/time";
import { dayRange } from "@/modules/minibar/server/dates";
import { denyScreen } from "@/modules/minibar/server/pageGuard";
import { listPoolAll } from "@/modules/minibar/server/pool";

export const metadata: Metadata = { title: "Depo panosu · Merit" };
export const dynamic = "force-dynamic";

type Card = { id: string; href: string; icon: IconName; title: string; value: string; note: string; tone: "ok" | "warn" | "danger" | "neutral" };

const TONE: Record<Card["tone"], string> = {
  ok: "border-success text-success",
  warn: "border-warn text-warn",
  danger: "border-danger text-danger",
  neutral: "border-border text-muted",
};

/** Depo panosu: yalnız yetkili kartlar çizilir; her kart ilgili ekrana gider. */
export default async function DepoHomePage() {
  const ctx = await requireUser();
  const hotelId = ctx.session.hotelId;
  const [zim, tal, dol, rap] = await Promise.all([
    can(ctx, "MB-ZIM", "V", hotelId),
    can(ctx, "MB-TAL", "V", hotelId),
    can(ctx, "MB-DOL", "V", hotelId),
    can(ctx, "MB-RAP", "V", hotelId),
  ]);
  if (!zim && !rap) denyScreen("MB-ZIM");

  const cards: Card[] = [];

  if (zim) {
    const rows = await listPoolAll(ctx, hotelId, { includeEmpty: true });
    const critical = rows.filter((row) => row.status === "STOKOUT" || row.status === "KRITIK").length;
    cards.push({
      id: "stock",
      href: "/depo/stok",
      icon: "box",
      title: "Kritik stok",
      value: String(critical),
      note: critical > 0 ? "ürün kritik seviyede ya da tükendi" : "Havuzda kritik ürün yok",
      tone: critical > 0 ? "danger" : "ok",
    });
  }

  if (tal) {
    const [corrections, requests] = await Promise.all([
      prisma.minibarCorrectionRequest.count({ where: { hotelId, status: "BEKLIYOR" } }),
      prisma.stockRequest.count({ where: { hotelId, status: "BEKLEMEDE" } }),
    ]);
    const pending = corrections + requests;
    cards.push({
      id: "requests",
      href: "/kat/duzeltme-onay",
      icon: "inbox",
      title: "Bekleyen talepler",
      value: String(pending),
      note: pending > 0 ? `${corrections} düzeltme · ${requests} ek talep` : "Bekleyen talep yok",
      tone: pending > 0 ? "warn" : "ok",
    });
  }

  if (dol) {
    const range = dayRange(businessDate());
    const latest = await prisma.occupancyUpload.findFirst({
      where: { hotelId, createdAt: { gte: range.gte, lt: range.lt }, status: { notIn: ["SILINDI"] } },
      orderBy: { createdAt: "desc" },
      select: { status: true, okRows: true, errorRows: true, createdAt: true },
    });
    const time = latest?.createdAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
    const failed = latest?.status === "HATA";
    cards.push({
      id: "occupancy",
      href: "/depo/doluluk-yukle",
      icon: "trending",
      title: "Doluluk yükleme",
      value: latest ? (failed ? "Hatalı" : "Yüklendi") : "Bekliyor",
      note: latest ? `${time} · ${latest.okRows} satır${latest.errorRows > 0 ? ` · ${latest.errorRows} hatalı` : ""}` : "Bugünün doluluk dosyası henüz yüklenmedi",
      tone: failed ? "danger" : latest ? "ok" : "warn",
    });
  }

  if (rap) {
    cards.push({
      id: "reports",
      href: "/depo/raporlar",
      icon: "chart",
      title: "Raporlar",
      value: "Aç",
      note: "Minibar tüketim ve stok raporları",
      tone: "neutral",
    });
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold text-text">Depo panosu</h1>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <li key={card.id}>
            <Link
              href={card.href}
              className={`flex min-h-[96px] items-center gap-4 rounded-xl border-2 bg-surface p-4 ${TONE[card.tone]}`}
            >
              <Icon name={card.icon} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold text-text">{card.title}</span>
                <span className="block text-sm text-muted">{card.note}</span>
              </span>
              <span className="text-2xl font-bold">{card.value}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
