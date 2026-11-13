import { pageHotelCtx } from "@/modules/minibar/server/selectedHotel";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import { RoutineCard } from "@/components/guide/RoutineCard";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { blockStyle, visibleBlocks, visibleItems } from "@/modules/core/screenLayouts";
import { getRoutines } from "@/modules/core/server/routines";
import { myScreenLayout } from "@/modules/core/server/screenLayouts";
import { depoDashboard } from "@/modules/minibar/server/depoDashboard";

export const dynamic = "force-dynamic";

export default async function DepoHomePage() {
  let ctx;
  try {
    ctx = await pageHotelCtx(await requireUser());
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

  const [seeStock, seeUpload, seeReports, seeDefs, seeCorrections] = await Promise.all([
    can(ctx, "MB-ZIM", "V", hotelId),
    can(ctx, "MB-DOL", "V", hotelId),
    can(ctx, "MB-RAP", "V", hotelId),
    can(ctx, "MB-TAN", "V", hotelId),
    can(ctx, "MB-TAL", "V", hotelId),
  ]);

  const routines = await getRoutines(ctx);

  const allCards = [
    {
      id: "stok",
      href: "/depo/stok",
      show: seeStock,
      title: "Minibar Stok & Talepler",
      subtitle: "Otel deposu stoğu, SKT takibi ve bekleyen kat talepleri",
      badge:
        pano && pano.pendingRequests > 0
          ? `${pano.pendingRequests} bekleyen talep`
          : pano && pano.criticalCount > 0
            ? `${pano.criticalCount} kritik stok`
            : null,
      tone: "border-accent/40 bg-accent/10 text-text",
    },
    {
      id: "gorevler",
      href: "/depo/gorevler",
      show: Boolean(pano),
      title: "Günlük Görevler",
      subtitle: "Günlük kontrol kalemlerinin durumu ve tamamlanma oranları",
      badge: pano?.tasks ? `${pano.tasks.completed}/${pano.tasks.total} tamamlandı` : null,
      tone: "border-ok/40 bg-ok/10 text-ok",
    },
    {
      id: "doluluk",
      href: "/depo/doluluk-yukle",
      show: seeUpload,
      title: "Doluluk Excel Yükleme",
      subtitle: "Günlük Konaklama (In-House), Giriş (Arrival) ve Çıkış (Departure) listeleri",
      badge: pano ? `${pano.doneCount}/3 yüklendi` : null,
      tone: "border-accent/40 bg-accent/10 text-text",
    },
    {
      id: "raporlar",
      href: "/depo/raporlar",
      show: seeReports,
      title: "Minibar Raporları",
      subtitle: "Tüketim maliyet/satış analizi, görev tamamlanma ve olağandışı işlem denetimi",
      badge: pano && pano.openDnd > 0 ? `${pano.openDnd} aktif DND` : null,
      tone: "border-warn/40 bg-warn/10 text-warn",
    },
    {
      id: "tanimlar",
      href: "/depo/tanimlar",
      show: seeDefs,
      title: "Minibar Tanımları",
      subtitle: "Ürün grupları, ürünler, setup şablonları, oda tipleri ve denetim kayıtları",
      badge: null,
      tone: "border-border bg-surface text-text",
    },
    {
      id: "duzeltme",
      href: "/kat/duzeltme-onay",
      show: seeCorrections,
      title: "Geçmiş Kayıt Düzeltme Onayları",
      subtitle: "Geçmiş tarihli oda kontrol kayıtları için gönderilen düzeltme/silme talepleri",
      badge: pano && pano.pendingCorrections > 0 ? `${pano.pendingCorrections} onay bekliyor` : null,
      tone: "border-danger/40 bg-danger/10 text-danger",
    },
  ];
  // Role layout (Kullanıcı Yönetimi → Ekranlar): block order, the cards and indicators shown, card style.
  const layout = await myScreenLayout(ctx, "depo");
  const cards = visibleItems(layout, "kartlar")
    .map((id) => allCards.find((card) => card.id === id))
    .filter((card) => card !== undefined && card.show)
    .map((card) => card!);
  const compactCards = blockStyle(layout, "kartlar") === "liste";
  const kpis = pano
    ? {
        doluluk: { label: "Doluluk Yükleme", value: `${pano.doneCount}/3`, box: "border-border bg-surface", head: "text-muted", num: "text-text" },
        talep: { label: "Bekleyen Talep", value: pano.pendingRequests, box: "border-warn/30 bg-warn/10", head: "text-warn", num: "text-warn" },
        kritik: { label: "Kritik Stok", value: pano.criticalCount, box: "border-danger/30 bg-danger/10", head: "text-danger", num: "text-danger" },
        dnd: { label: "Aktif DND", value: pano.openDnd, box: "border-accent/30 bg-accent/10", head: "text-text", num: "text-accent" },
      }
    : null;
  const kpiIds = visibleItems(layout, "kpi") as (keyof NonNullable<typeof kpis>)[];

  const blocks: Record<string, React.ReactNode> = {
    rutin: routines.length > 0 ? <RoutineCard key="rutin" routines={routines} /> : null,
    kpi: kpis ? (
      <section key="kpi" className={`grid grid-cols-2 gap-3 ${kpiIds.length >= 4 ? "sm:grid-cols-4" : kpiIds.length === 3 ? "sm:grid-cols-3" : ""}`}>
        {kpiIds.map((id) => (
          <div key={id} className={`rounded-2xl border p-4 ${kpis[id].box}`}>
            <p className={`text-sm uppercase tracking-wider ${kpis[id].head}`}>{kpis[id].label}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${kpis[id].num}`}>{kpis[id].value}</p>
          </div>
        ))}
      </section>
    ) : null,
    kartlar: compactCards ? (
      <div key="kartlar" className="overflow-hidden rounded-2xl border border-border bg-surface divide-y divide-border">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={`${card.href}?hotelId=${encodeURIComponent(hotelId)}`}
            style={{ minHeight: "var(--tap-action)" }}
            className="group flex items-center justify-between gap-3 px-5 py-3 hover:bg-bg"
          >
            <span className="text-base font-bold text-text group-hover:text-accent transition">{card.title}</span>
            <span className="flex items-center gap-3">
              {card.badge ? (
                <span className={`rounded-full border px-2.5 py-0.5 text-sm font-bold ${card.tone}`}>{card.badge}</span>
              ) : null}
              <span className="text-sm font-semibold text-accent">→</span>
            </span>
          </Link>
        ))}
      </div>
    ) : (
      <div key="kartlar" className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={`${card.href}?hotelId=${encodeURIComponent(hotelId)}`}
            className="group flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 transition hover:border-accent"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-bold text-text group-hover:text-accent transition">{card.title}</h2>
                {card.badge ? (
                  <span className={`rounded-full border px-2.5 py-0.5 text-sm font-bold ${card.tone}`}>{card.badge}</span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-muted">{card.subtitle}</p>
            </div>
            <div className="mt-4 flex items-center justify-end text-sm font-semibold text-accent">Ekranı Aç →</div>
          </Link>
        ))}
      </div>
    ),
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-sm font-semibold uppercase tracking-widest text-accent">Depo ve Minibar Yönetimi</span>
          <h1 className="text-xl font-bold text-text">Depo panosu</h1>
          {pano ? <p className="text-sm text-muted">{pano.hotelName}</p> : null}
        </div>
        <Link
          href="/kat"
          style={{ minHeight: "var(--tap-action)" }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-semibold text-text hover:bg-bg"
        >
          <Icon name="floor" size={16} />
          Kat Sorumlusu Ekranı
        </Link>
      </header>

      {visibleBlocks(layout).map((block) => blocks[block.id] ?? null)}
    </div>
  );
}
