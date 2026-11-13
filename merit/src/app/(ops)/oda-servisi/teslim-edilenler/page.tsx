import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import { requireUser } from "@/lib/auth";
import { formatPrice } from "@/lib/formatPrice";
import { can } from "@/lib/rbac";
import { businessDate, formatDayTr, TZ } from "@/lib/time";
import { denyScreen } from "@/modules/minibar/server/pageGuard";
import {
  delivered,
  DELIVERED_SCREEN,
  parseDeliveredQuery,
  pickDeliveredTarget,
  type DeliveredList,
  type DeliveredRow,
} from "@/modules/order/server/roomService/delivered";

type Search = { tarih?: string | string[]; oda?: string | string[]; sayfa?: string | string[]; otel?: string | string[] };

const ROUTE = "/oda-servisi/teslim-edilenler";

/** One grid for the column heads and every row (wide screens); a phone stacks the cells with their labels. */
const ROW_GRID = "md:grid md:grid-cols-[5rem_5rem_4.5rem_4.5rem_minmax(8rem,1fr)_minmax(8rem,1.2fr)_6.5rem_1.5rem] md:items-center md:gap-3";

function clock(value: Date): string {
  return value.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

/** Address of the list with the given filter; defaults are left out. */
function hrefOf(filter: { day: string; room: string; page: number; hotel: string }, today: string): string {
  const params = new URLSearchParams();
  if (filter.hotel) params.set("otel", filter.hotel);
  if (filter.day !== today) params.set("tarih", filter.day);
  if (filter.room) params.set("oda", filter.room);
  if (filter.page > 1) params.set("sayfa", String(filter.page));
  const qs = params.toString();
  return qs ? `${ROUTE}?${qs}` : ROUTE;
}

/**
 * Delivered room-service orders by delivery day and room (`?tarih=&oda=&sayfa=&otel=`). Read-only; the same
 * gate as the delivery tab (RO-TES view) and the session hotel's single ODA_SERVISI outlet, exactly like the
 * board (renderOdaServisi). A user who covers other hotels right now (cross-hotel coverage) may pick one of
 * them with `?otel=<hotel code>`; any other value lists the session hotel.
 */
export default async function TeslimEdilenlerPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await requireUser();
  const hotelId = ctx.session.hotelId;
  if (!hotelId) redirect("/secim");
  if (!(await can(ctx, DELIVERED_SCREEN, "V", hotelId))) denyScreen(DELIVERED_SCREEN);

  const allowed = await delivered.targets(ctx);
  const home = allowed.home;
  if (!home) redirect("/secim");

  const today = businessDate();
  const query = parseDeliveredQuery(await searchParams);
  const target = pickDeliveredTarget(allowed, query.hotel) ?? home;
  // The address keeps `otel` only for a covered hotel; a value that is not allowed is dropped.
  const filter = { ...query, hotel: target.covered ? target.hotelCode : "" };

  let data: DeliveredList | null = null;
  let loadError: string | null = null;
  try {
    data = await delivered.list(ctx, target.outletId, { day: filter.day, room: filter.room, page: filter.page });
  } catch (error: unknown) {
    loadError = error instanceof Error ? error.message : "Liste yüklenemedi";
  }

  const filtered = filter.day !== today || filter.room !== "";

  return (
    <section aria-label="Teslim edilen oda servisi siparişleri" className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-black tracking-tight text-text">
          <Icon name="check-circle" size={20} />
          <span>Teslim Edilenler</span>
          <span className="rounded-full border border-accent px-2 py-0.5 text-[13px] font-bold text-accent">{target.hotelName}</span>
        </h1>

        <form method="get" action={ROUTE} className="mt-3 flex flex-wrap items-end gap-3">
          {allowed.covered.length > 0 ? (
            <label className="flex flex-col gap-1 text-[13px] font-semibold text-muted">
              <span>Otel</span>
              <select
                name="otel"
                defaultValue={target.hotelCode}
                className="min-h-11 rounded-xl border border-border bg-surface px-3 text-base font-bold text-text"
              >
                {[home, ...allowed.covered].map((option) => (
                  <option key={option.hotelId} value={option.hotelCode}>
                    {option.hotelName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-muted">
            <span>Teslim tarihi</span>
            <input
              type="date"
              name="tarih"
              defaultValue={filter.day}
              max={today}
              required
              className="min-h-11 rounded-xl border border-border bg-surface px-3 text-base font-bold text-text"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-muted">
            <span>Oda</span>
            <input
              type="text"
              name="oda"
              defaultValue={filter.room}
              inputMode="numeric"
              autoComplete="off"
              maxLength={12}
              placeholder="Oda no"
              className="min-h-11 w-32 rounded-xl border border-border bg-surface px-3 text-base font-bold text-text"
            />
          </label>
          <button type="submit" className="min-h-11 rounded-xl bg-accent px-5 text-sm font-black text-bg">
            Listele
          </button>
          {filtered ? (
            <Link
              href={hrefOf({ day: today, room: "", page: 1, hotel: filter.hotel }, today)}
              className="flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-bold text-text"
            >
              Bugüne dön
            </Link>
          ) : null}
        </form>
      </div>

      {loadError ? (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm font-semibold text-danger">
          {loadError}
        </p>
      ) : null}

      {data ? (
        <>
          <p role="status" className="flex flex-wrap items-baseline justify-between gap-2 px-1 text-sm font-bold text-text">
            <span data-testid="delivered-count">{`${data.total} teslim`}</span>
            <span className="text-[13px] font-medium text-muted">
              {`${target.hotelName} · ${formatDayTr(data.day)}${data.room ? ` · Oda ${data.room}` : ""} · Hedef süre ${data.slaMinutes} dk`}
            </span>
          </p>

          {data.rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-[13px] text-muted">
              Bu tarihte teslim edilen sipariş yok.
            </p>
          ) : (
            <div className="space-y-2">
              <div aria-hidden="true" className={`hidden px-3 text-[13px] font-semibold text-muted ${ROW_GRID}`}>
                <span>Oda</span>
                <span>Sipariş no</span>
                <span>Alındı</span>
                <span>Teslim edildi</span>
                <span>Süre</span>
                <span>Teslim eden</span>
                <span className="text-right">Tutar</span>
                <span />
              </div>
              <ul className="space-y-2">
                {data.rows.map((row) => (
                  <DeliveredItem key={row.id} row={row} />
                ))}
              </ul>
            </div>
          )}

          {data.pageCount > 1 ? (
            <nav aria-label="Sayfalar" className="flex items-center justify-between gap-3">
              <PageLink href={hrefOf({ ...filter, page: data.page - 1 }, today)} disabled={data.page <= 1} label="Önceki" />
              <span className="text-[13px] font-semibold text-muted">{`Sayfa ${data.page} / ${data.pageCount}`}</span>
              <PageLink href={hrefOf({ ...filter, page: data.page + 1 }, today)} disabled={data.page >= data.pageCount} label="Sonraki" />
            </nav>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function PageLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  const box = "flex min-h-11 min-w-24 items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-bold";
  if (disabled) {
    return (
      <span aria-disabled="true" className={`${box} text-muted opacity-50`}>
        {label}
      </span>
    );
  }
  return (
    <Link href={href} className={`${box} text-text`}>
      {label}
    </Link>
  );
}

/** Label of a cell, shown only where the column heads are not (phones). */
function CellLabel({ children }: { children: string }) {
  return <span className="text-[13px] font-medium text-muted md:hidden">{children}</span>;
}

/** One delivery; tapping the row opens its lines (native disclosure, read-only). */
function DeliveredItem({ row }: { row: DeliveredRow }) {
  return (
    <li data-delivered-id={row.id}>
      <details className="group rounded-2xl border border-border bg-surface">
        <summary className={`min-h-11 cursor-pointer list-none p-3 [&::-webkit-details-marker]:hidden ${ROW_GRID}`}>
          <span className="flex items-baseline justify-between gap-2 md:contents">
            <span className="text-base font-black text-text">
              <span className="md:hidden">Oda </span>
              {row.roomNumber}
            </span>
            <span className="text-sm font-bold text-text">{`#${row.orderNo}`}</span>
          </span>
          <span className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm text-text md:contents">
            <span className="flex flex-col md:block">
              <CellLabel>Alındı</CellLabel>
              <span>{clock(row.createdAt)}</span>
            </span>
            <span className="flex flex-col md:block">
              <CellLabel>Teslim edildi</CellLabel>
              <span className="font-bold">{clock(row.deliveredAt)}</span>
            </span>
            <span className="flex flex-col md:block">
              <CellLabel>Süre</CellLabel>
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-bold">{`${row.durationMin} dk`}</span>
                <span
                  data-sla={row.onTime ? "on-time" : "late"}
                  className={`rounded-full border px-2 py-0.5 text-[13px] font-bold ${
                    row.onTime ? "border-success/40 text-success" : "border-danger/40 text-danger"
                  }`}
                >
                  {row.onTime ? "Süresinde" : "Süre aşıldı"}
                </span>
              </span>
            </span>
            <span className="flex min-w-0 flex-col md:block">
              <CellLabel>Teslim eden</CellLabel>
              <span className="truncate">{row.deliveredBy ?? "—"}</span>
            </span>
            <span className="flex flex-col md:block md:text-right">
              <CellLabel>Tutar</CellLabel>
              <span>{row.subtotal ? formatPrice(row.subtotal, row.currency ?? "EUR") : "—"}</span>
            </span>
            <span className="hidden text-muted md:block">
              <Icon name="chevron-down" size={16} className="group-open:rotate-180" />
            </span>
          </span>
          <span className="mt-2 block text-[13px] font-semibold text-accent md:hidden">
            <span className="group-open:hidden">Ürünleri göster</span>
            <span className="hidden group-open:inline">Ürünleri gizle</span>
          </span>
        </summary>
        <div className="border-t border-border p-3">
          <ul className="space-y-1.5 text-sm text-text">
            {row.items.map((item, index) => (
              <li key={index}>
                <span className="font-bold">{`${item.qty}× `}</span>
                <span>{item.name}</span>
                {item.note ? <span className="block text-[13px] text-muted">{`Not: ${item.note}`}</span> : null}
              </li>
            ))}
          </ul>
          {row.note ? <p className="mt-2 text-[13px] text-muted">{`Sipariş notu: ${row.note}`}</p> : null}
        </div>
      </details>
    </li>
  );
}
