import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import { RoutineCard } from "@/components/guide/RoutineCard";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { getRoutines } from "@/modules/core/server/routines";
import { depoDashboard } from "@/modules/minibar/server/depoDashboard";

export const dynamic = "force-dynamic";

export default async function DepoHomePage() {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (error) {
    if (error instanceof DomainError && error.code === "UNAUTHORIZED") {
      redirect("/giris?next=/depo");
    }
    throw error;
  }

  const hotelId = ctx.session.hotelId;
  if (!hotelId) redirect("/secim");

  let pano: Awaited<ReturnType<typeof depoDashboard>> | null = null;
  try {
    pano = await depoDashboard(ctx);
  } catch (error) {
    if (!(error instanceof DomainError && error.code === "FORBIDDEN")) throw error;
  }

  let hotelName = pano?.hotelName ?? "Otel";
  let pendingRequests = pano?.pendingRequests ?? 0;
  let pendingCorrections = pano?.pendingCorrections ?? 0;
  const criticalCount = pano?.criticalCount ?? 0;
  let openDnd = pano?.openDnd ?? 0;

  if (!pano) {
    const [hotel, reqCount, corrCount, dndCount] = await Promise.all([
      prisma.hotel.findUnique({ where: { id: hotelId }, select: { name: true } }),
      prisma.stockRequest.count({ where: { hotelId, status: "BEKLEMEDE" } }),
      prisma.minibarCorrectionRequest.count({ where: { hotelId, status: "BEKLIYOR" } }),
      prisma.roomDnd.count({ where: { hotelId, status: "AKTIF" } }),
    ]);
    hotelName = hotel?.name ?? "Otel";
    pendingRequests = reqCount;
    pendingCorrections = corrCount;
    openDnd = dndCount;
  }

  const routines = await getRoutines(ctx);

  const cards = [
    {
      href: "/depo/stok",
      title: "Minibar Stok & Talepler",
      subtitle: "Otel havuz stoğu, fatura alış ve zayi girişleri, bekleyen kat talepleri",
      badge:
        pendingRequests > 0
          ? `${pendingRequests} bekleyen talep`
          : criticalCount > 0
            ? `${criticalCount} kritik stok`
            : null,
      tone: "border-accent/40 bg-accent/10 text-accent",
    },
    {
      href: "/depo/gorevler",
      title: "Günlük Görevler",
      subtitle: "Günlük kontrol kalemlerinin durumu ve tamamlanma oranları",
      badge: pano?.tasks ? `${pano.tasks.completed}/${pano.tasks.total} tamamlandı` : null,
      tone: "border-ok/40 bg-ok/10 text-ok",
    },
    {
      href: "/depo/doluluk-yukle",
      title: "Doluluk Excel Yükleme",
      subtitle: "Günlük Konaklama (In-House), Giriş (Arrival) ve Çıkış (Departure) listeleri",
      badge: pano ? `${pano.doneCount}/3 yüklendi` : null,
      tone: "border-accent/40 bg-accent/10 text-accent",
    },
    {
      href: "/depo/raporlar",
      title: "Minibar Raporları",
      subtitle: "Tüketim maliyet/satış analizi, görev tamamlanma ve olağandışı işlem denetimi",
      badge: openDnd > 0 ? `${openDnd} aktif DND` : null,
      tone: "border-warn/40 bg-warn/10 text-warn",
    },
    {
      href: "/depo/tanimlar",
      title: "Minibar Tanımları",
      subtitle: "Ürün grupları, ürünler, setup şablonları, oda tipleri ve denetim kayıtları",
      badge: null,
      tone: "border-border bg-surface text-text",
    },
    {
      href: "/kat/duzeltme-onay",
      title: "Geçmiş Kayıt Düzeltme Onayları",
      subtitle: "Geçmiş tarihli oda kontrol kayıtları için gönderilen düzeltme/silme talepleri",
      badge: pendingCorrections > 0 ? `${pendingCorrections} onay bekliyor` : null,
      tone: "border-danger/40 bg-danger/10 text-danger",
    },
  ];

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-border bg-bg/95 px-6 py-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-accent">
              Merit Royal · Depo & Minibar Yönetimi
            </span>
            <h1 className="text-xl font-bold text-text">{hotelName} — Depo Yönetim Paneli</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/kat"
              style={{ minHeight: "var(--tap-action)" }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-text hover:bg-bg"
            >
              <Icon name="floor" size={16} />
              Kat Sorumlusu Ekranı
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-6">
        {routines.length > 0 ? <RoutineCard routines={routines} /> : null}

        {pano ? (
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-xs uppercase tracking-wider text-muted">Doluluk Yükleme</p>
              <p className="mt-1 text-2xl font-bold text-text tabular-nums">{pano.doneCount}/3</p>
            </div>
            <div className="rounded-2xl border border-warn/30 bg-warn/10 p-4">
              <p className="text-xs uppercase tracking-wider text-warn">Bekleyen Talep</p>
              <p className="mt-1 text-2xl font-bold text-warn tabular-nums">{pano.pendingRequests}</p>
            </div>
            <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4">
              <p className="text-xs uppercase tracking-wider text-danger">Kritik Stok</p>
              <p className="mt-1 text-2xl font-bold text-danger tabular-nums">{pano.criticalCount}</p>
            </div>
            <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4">
              <p className="text-xs uppercase tracking-wider text-accent">Aktif DND</p>
              <p className="mt-1 text-2xl font-bold text-accent tabular-nums">{pano.openDnd}</p>
            </div>
          </section>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 transition hover:border-accent"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-bold text-text group-hover:text-accent transition">
                    {card.title}
                  </h2>
                  {card.badge ? (
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${card.tone}`}>
                      {card.badge}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-muted">{card.subtitle}</p>
              </div>
              <div className="mt-4 flex items-center justify-end text-xs font-semibold text-accent">
                Ekranı Aç →
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
