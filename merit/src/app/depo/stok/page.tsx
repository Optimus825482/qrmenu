"use client";

import { mbFetch, useHotelHref } from "@/modules/minibar/ui/mbFetch";
import { useInShellFrame } from "@/shell/useInShellFrame";
import Link from "next/link";
import { BackLink } from "@/components/staff/BackLink";
import { ScreenLink } from "@/components/staff/StaffScreens";
import { screenTitle } from "@/components/staff/screenTitle";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/icons/Icon";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { useDialogFocus } from "@/components/ui/useDialogFocus";
import { StockCorrectionRequests } from "@/modules/minibar/ui/StockCorrectionRequests";

interface DepoStockItem {
  id: string;
  productId: string;
  productName: string;
  categoryName: string;
  price: number;
  currency: string;
  quantity: number;
  minLevel: number;
  /** false: deactivated product the hotel still holds. */
  productActive?: boolean;
  /** Opening quantity booked when stock tracking started; null when the product has none. */
  openingQty?: number | null;
  lastUpdated: string;
}

interface ExpiryItem {
  id: string;
  productName: string;
  groupName: string;
  expiryDate: string;
  daysLeft: number;
  qty: number;
  remainingQty: number;
  status: "GECTI" | "YAKIN" | "NORMAL";
  receiptCode: string | null;
}

interface OpeningWindow {
  editableUntil: string;
  open: boolean;
  canEdit: boolean;
}

const RULE_NOTE_KEY = "merit.depo.stok.kuralNotuGizli";

const EXPIRY_TONE: Record<ExpiryItem["status"], string> = {
  GECTI: "border-danger bg-[var(--danger-bg)] text-danger",
  YAKIN: "border-warn bg-[var(--warn-bg)] text-warn",
  NORMAL: "border-success bg-[var(--success-bg)] text-success",
};
const EXPIRY_LABEL: Record<ExpiryItem["status"], string> = { GECTI: "SKT geçti", YAKIN: "SKT yakın", NORMAL: "Normal" };

interface StockMovementItem {
  id: string;
  productName: string;
  type: string;
  /** Source of the movement ("MybarRequest" for a MyBar return). */
  refType?: string | null;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  note: string | null;
  userName: string;
  createdAt: string;
}

interface HotelItem {
  id: string;
  name: string;
  code: string;
}

type MovementType = "GIRIS" | "DUZELTME";

const MOVEMENT_TONE: Record<string, string> = {
  GIRIS: "border-success text-success",
  SARFIYAT: "border-danger text-danger",
  IADE: "border-info text-info",
};

const FIELD =
  "min-h-[var(--tap-std)] w-full rounded-[var(--radius-m)] border border-border bg-bg px-3 text-base text-text placeholder:text-muted";
const LINK_BUTTON =
  "inline-flex min-h-[var(--tap-std)] items-center gap-2 rounded-[var(--radius-m)] border border-border bg-surface px-4 text-sm font-semibold text-text";

const PAGE_SIZES = [25, 50, 100] as const;
const TABLE_WRAP = "overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const THEAD = "border-b-2 border-border bg-bg text-sm text-text";
const rowClass = (i: number) => `border-b border-border last:border-b-0 hover:bg-accent/10 ${i % 2 === 0 ? "bg-surface" : "bg-bg"}`;

type SortState = { key: string; dir: 1 | -1 } | null;
type SortPageView = {
  sort: SortState;
  toggleSort: (key: string) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  page: number;
  pageCount: number;
  setPage: (n: number) => void;
  total: number;
  first: number;
};

/** Client-side sorting and paging of a list. Empty cells sort last; numeric columns start from the largest. */
function useSortPage<T>(
  rows: T[],
  values: Record<string, (row: T) => string | number | null>,
  numeric: readonly string[],
): SortPageView & { visible: T[] } {
  const [sort, setSort] = useState<SortState>(null);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);

  let list = rows;
  const get = sort ? values[sort.key] : undefined;
  if (sort && get) {
    const empty = (v: unknown) => v === null || v === undefined || v === "";
    list = rows
      .map((row, index) => ({ row, index, v: get(row) }))
      .sort((a, b) => {
        if (empty(a.v) || empty(b.v)) return empty(a.v) === empty(b.v) ? a.index - b.index : empty(a.v) ? 1 : -1;
        const result =
          typeof a.v === "number" && typeof b.v === "number"
            ? a.v - b.v
            : String(a.v).localeCompare(String(b.v), "tr", { numeric: true, sensitivity: "base" });
        return result === 0 ? a.index - b.index : sort.dir * result;
      })
      .map((x) => x.row);
  }
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const current = Math.min(page, pageCount);
  return {
    visible: list.slice((current - 1) * pageSize, current * pageSize),
    sort,
    toggleSort: (key) => {
      setSort((s) => (s?.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: numeric.includes(key) ? -1 : 1 }));
      setPage(1);
    },
    pageSize,
    setPageSize: (n) => {
      setPageSize(n);
      setPage(1);
    },
    page: current,
    pageCount,
    setPage,
    total: list.length,
    first: list.length === 0 ? 0 : (current - 1) * pageSize + 1,
  };
}

/** Column header that sorts the table when pressed. */
function SortTh({
  view,
  k,
  align = "left",
  "data-guide": guide,
  children,
}: {
  view: SortPageView;
  k: string;
  align?: "left" | "center";
  "data-guide"?: string;
  children: string;
}) {
  const on = view.sort?.key === k;
  return (
    <th
      scope="col"
      data-guide={guide}
      aria-sort={on ? (view.sort?.dir === 1 ? "ascending" : "descending") : "none"}
      className={`whitespace-nowrap px-1 py-1 ${align === "center" ? "text-center" : "text-left"}`}
    >
      <button
        type="button"
        onClick={() => view.toggleSort(k)}
        title={`${children} sütununa göre sırala`}
        className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 font-bold hover:bg-surface"
      >
        {children}
        <span aria-hidden="true" className={on ? "text-accent" : "text-muted"}>
          {on ? (view.sort?.dir === 1 ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

/** Page size and page buttons under a table. */
function Pager({ view, noun }: { view: SortPageView; noun: string }) {
  const pager = "min-h-11 min-w-11 rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-text hover:bg-bg disabled:opacity-40";
  return (
    <nav aria-label={`${noun} sayfalama`} className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3">
      <p className="text-xs text-muted">
        {view.total === 0 ? `0 ${noun}` : `${view.first}–${Math.min(view.total, view.page * view.pageSize)} / ${view.total} ${noun}`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-muted">
          Sayfada
          <select
            value={view.pageSize}
            onChange={(e) => view.setPageSize(Number(e.target.value))}
            className="min-h-11 rounded-xl border border-border bg-bg px-3 text-sm text-text focus:border-accent focus:outline-none"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={pager} disabled={view.page <= 1} onClick={() => view.setPage(1)} aria-label="İlk sayfa">
          «
        </button>
        <button type="button" className={pager} disabled={view.page <= 1} onClick={() => view.setPage(view.page - 1)}>
          Önceki
        </button>
        <span className="text-sm font-bold tabular-nums text-text">
          {view.page} / {view.pageCount}
        </span>
        <button type="button" className={pager} disabled={view.page >= view.pageCount} onClick={() => view.setPage(view.page + 1)}>
          Sonraki
        </button>
        <button type="button" className={pager} disabled={view.page >= view.pageCount} onClick={() => view.setPage(view.pageCount)} aria-label="Son sayfa">
          »
        </button>
      </div>
    </nav>
  );
}

export default function DepoStokPage() {
  const hotelHref = useHotelHref();
  const [hotels, setHotels] = useState<HotelItem[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<string>("");
  const [stockItems, setStockItems] = useState<DepoStockItem[]>([]);
  const [movements, setMovements] = useState<StockMovementItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"STOCK" | "SKT" | "MOVEMENTS">("STOCK");
  const [expiry, setExpiry] = useState<ExpiryItem[]>([]);
  const [canManage, setCanManage] = useState(false);
  // Minibar sistem sorumlusu: the count is sent to the system administrator instead of being booked.
  const [countNeedsApproval, setCountNeedsApproval] = useState(false);
  // Set while Minibar Yönetimi corrects without approval: the last day of that period (ISO).
  const [directUntil, setDirectUntil] = useState<string | null>(null);
  const [correctionsKey, setCorrectionsKey] = useState(0);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const [opening, setOpening] = useState<OpeningWindow | null>(null);
  const [openingProduct, setOpeningProduct] = useState<DepoStockItem | null>(null);
  // "Bir daha gösterme" on the rule note: remembered on this device.
  const [ruleHidden, setRuleHidden] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setRuleHidden(window.localStorage.getItem(RULE_NOTE_KEY) === "1");
      } catch {
        setRuleHidden(false);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const hideRule = () => {
    setRuleHidden(true);
    try {
      window.localStorage.setItem(RULE_NOTE_KEY, "1");
    } catch {
      // Storage blocked: the note stays hidden until the page is reloaded.
    }
  };
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [selectedProduct, setSelectedProduct] = useState<DepoStockItem | null>(null);
  const [movementType, setMovementType] = useState<MovementType>("GIRIS");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [canCount, setCanCount] = useState(false);
  const [movementsTotal, setMovementsTotal] = useState(0);
  const [movementsPage, setMovementsPage] = useState(1);

  const inShellFrame = useInShellFrame();

  const loadData = useCallback(async (hotelId?: string, page = 1) => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const urlFor = (hotel?: string) => {
        const params = new URLSearchParams();
        if (hotel) params.set("hotelId", hotel);
        if (page > 1) params.set("movementsPage", String(page));
        return `/api/minibar/depo/stock${params.size > 0 ? `?${params.toString()}` : ""}`;
      };
      let res = await fetch(urlFor(hotelId));
      let deniedHotel = false;
      if (res.status === 403 && hotelId) {
        // The hotel in the address is not one this account may open: fall back to the session hotel.
        deniedHotel = true;
        const url = new URL(window.location.href);
        url.searchParams.delete("hotelId");
        window.history.replaceState({}, "", url.toString());
        res = await fetch(urlFor());
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          res.status === 403
            ? "Otel deposunu görme yetkiniz yok."
            : data.error || "Stok bilgileri alınamadı.",
        );
      }
      if (deniedHotel) {
        setErrorMsg("Seçilen otelin deposunu görme yetkiniz yok; kendi otelinizin deposu gösteriliyor.");
      }
      setStockItems(data.stockItems || []);
      setMovements((prev) => (page > 1 ? [...prev, ...(data.movements || [])] : data.movements || []));
      setMovementsTotal(data.movementsTotal ?? 0);
      setMovementsPage(page);
      setHotels(data.hotels || []);
      setCanCount(data.canCount === true);
      setCanManage(data.canManage === true);
      setCountNeedsApproval(data.countNeedsApproval === true);
      setDirectUntil(typeof data.directCorrectionUntil === "string" ? data.directCorrectionUntil : null);
      setExpiry(data.expiry || []);
      setOpening(data.opening ?? null);
      if (data.selectedHotelId) setSelectedHotelId(data.selectedHotelId);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Bağlantı hatası.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // The server echoes the hotel it served (`selectedHotelId`); the first load runs outside the effect body.
    const initialHotel = new URLSearchParams(window.location.search).get("hotelId");
    const t = setTimeout(() => void loadData(initialHotel ?? undefined), 0);
    return () => clearTimeout(t);
  }, [loadData]);

  const handleHotelChange = (id: string) => {
    setSelectedHotelId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("hotelId", id);
    window.history.replaceState({}, "", url.toString());
    void loadData(id);
  };

  const openAdjustModal = (item: DepoStockItem, defaultType: MovementType = "GIRIS") => {
    setSelectedProduct(item);
    setMovementType(defaultType);
  };

  const needle = searchQuery.toLowerCase();
  const filteredItems = stockItems.filter(
    (item) => item.productName.toLowerCase().includes(needle) || item.categoryName.toLowerCase().includes(needle),
  );

  const stockView = useSortPage(
    filteredItems,
    { name: (r) => r.productName, category: (r) => r.categoryName, qty: (r) => r.quantity, min: (r) => r.minLevel },
    ["qty", "min"],
  );
  const expiryView = useSortPage(
    expiry,
    {
      product: (r) => r.productName,
      date: (r) => r.expiryDate,
      // Fewer days left is more urgent, so the first (descending) click lists the expired lots first.
      status: (r) => -r.daysLeft,
      qty: (r) => r.remainingQty,
      receipt: (r) => r.receiptCode,
    },
    ["status", "qty"],
  );
  const movementView = useSortPage(
    movements,
    {
      date: (r) => new Date(r.createdAt).getTime(),
      product: (r) => r.productName,
      type: (r) => r.type,
      change: (r) => r.quantity,
      after: (r) => r.newQuantity,
      user: (r) => r.userName,
      note: (r) => r.note,
    },
    ["date", "change", "after"],
  );

  return (
    <div className="flex flex-col gap-4 text-text">
      <div className="flex flex-wrap items-center gap-2">
        <BackLink parent={hotelHref("/depo", selectedHotelId)} />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Icon name="box" size={24} />
            {screenTitle("MB-ZIM")}
          </h1>
          <p className="text-sm text-muted">Minibar stok takibi: otelin deposundaki ürünler, SKT ve hareketler</p>
        </div>
        {/* Inside a shell window the banner already offers the hotel selector. */}
        {hotels.length > 0 && !inShellFrame ? (
          <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 shadow-sm">
            <span className="flex items-center gap-1 whitespace-nowrap text-xs font-bold text-muted">
              <Icon name="building" size={16} />
              Otel:
            </span>
            {hotels.length > 1 ? (
              <select
                aria-label="Otel Seçimi"
                value={selectedHotelId}
                onChange={(e) => handleHotelChange(e.target.value)}
                className="min-h-11 min-w-0 cursor-pointer rounded-xl border border-border bg-bg px-3 text-sm font-bold text-text focus:border-accent focus:outline-none"
              >
                {hotels.map((h) => (
                  <option key={h.id} value={h.id} className="bg-surface text-text">
                    {h.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-bold text-text">{hotels[0]?.name}</span>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {canManage ? (
          <Link href="/depo/tedarik" className={LINK_BUTTON}>
            <Icon name="plus" size={20} />
            Merkez depo tedarik
          </Link>
        ) : null}
        <ScreenLink href={hotelHref("/depo/doluluk-yukle", selectedHotelId)} className={LINK_BUTTON}>
          <Icon name="chart" size={20} />
          {screenTitle("MB-DOL")}
        </ScreenLink>
        <ScreenLink href={hotelHref("/depo/raporlar", selectedHotelId)} className={LINK_BUTTON}>
          <Icon name="trending" size={20} />
          {screenTitle("MB-RAP")}
        </ScreenLink>
        <ScreenLink href={hotelHref("/depo/tanimlar", selectedHotelId)} className={LINK_BUTTON}>
          <Icon name="settings" size={20} />
          {screenTitle("MB-TAN")}
        </ScreenLink>
      </div>

      {ruleHidden ? null : (
        <div className="flex items-start gap-3 rounded-[var(--radius-l)] border border-success bg-[var(--success-bg)] p-4 text-sm text-text">
          <Icon name="info" size={24} />
          <div className="min-w-0 flex-1 space-y-2">
            <p>
              <strong>Otel deposu kuralı:</strong> Merkez depodan alınan ürünler doğrudan otel depolarına dağıtılır; kişiye stok
              atanmaz. Oda kontrolünde tamamlanan her ürün, odanın bulunduğu otelin deposundan otomatik düşer.
            </p>
            <label className="inline-flex min-h-[var(--tap-min)] cursor-pointer items-center gap-2 font-semibold">
              <input type="checkbox" className="h-5 w-5" onChange={(e) => e.target.checked && hideRule()} />
              Bir daha gösterme
            </label>
          </div>
        </div>
      )}

      {opening?.open ? (
        <div className="flex items-start gap-3 rounded-[var(--radius-l)] border border-info bg-[var(--info-bg)] p-4 text-sm text-text">
          <Icon name="info" size={24} />
          <p>
            <strong>Başlangıç stoğu:</strong> Her ürün 1000 adetle açıldı.{" "}
            {opening.canEdit
              ? "Gerçek miktarı ürün satırındaki “Başlangıç stoğu” düğmesinden düzeltebilirsiniz."
              : "Düzeltmeyi minibar operasyonları sistem sorumlusu yapar."}{" "}
            Son gün: {new Date(opening.editableUntil).toLocaleString("tr-TR", { dateStyle: "long", timeStyle: "short" })}.
          </p>
        </div>
      ) : null}

      {errorMsg ? (
        <div role="alert" className="rounded-[var(--radius-l)] border border-danger bg-[var(--danger-bg)] p-4 text-sm text-danger">
          {errorMsg}
        </div>
      ) : null}

      {sentNote ? (
        <div role="status" className="rounded-[var(--radius-l)] border border-success bg-[var(--success-bg)] p-4 text-sm text-success">
          {sentNote}
        </div>
      ) : null}

      {/* Only those who may request or resolve a correction can list them (the API refuses the rest). */}
      {selectedHotelId && (canManage || canCount) ? (
        <StockCorrectionRequests
          hotelId={selectedHotelId}
          refreshKey={correctionsKey}
          hideWhenEmpty
          onResolved={() => void loadData(selectedHotelId)}
        />
      ) : null}

      <div data-guide="hareketler" className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <Segmented
          label="Depo bölümleri"
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: "STOCK", label: `Mevcut stok (${filteredItems.length})`, icon: <Icon name="box" size={20} /> },
            { value: "SKT", label: `SKT takibi (${expiry.length})`, icon: <Icon name="warning" size={20} /> },
            { value: "MOVEMENTS", label: `Hareket geçmişi (${movementsTotal})`, icon: <Icon name="list" size={20} /> },
          ]}
        />
        {activeTab === "STOCK" ? (
          <input
            type="search"
            aria-label="Ürün veya kategori ara"
            placeholder="Ürün veya kategori ara..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              stockView.setPage(1);
            }}
            className={`${FIELD} sm:w-72`}
          />
        ) : null}
      </div>

      {activeTab === "STOCK" ? (
        <div data-guide="havuz-listesi" className="overflow-hidden rounded-[var(--radius-l)] border border-border bg-surface">
          {isLoading ? (
            <p className="py-12 text-center text-muted">Stok listesi yükleniyor...</p>
          ) : filteredItems.length === 0 ? (
            <p className="py-12 text-center text-muted">Ürün bulunamadı.</p>
          ) : (
            <>
              <div className={TABLE_WRAP} tabIndex={0} role="region" aria-label="Mevcut stok tablosu">
                <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                  <thead>
                    <tr className={THEAD}>
                      <SortTh view={stockView} k="name">Ürün adı</SortTh>
                      <SortTh view={stockView} k="category">Kategori</SortTh>
                      <SortTh view={stockView} k="qty" align="center">Depodaki miktar</SortTh>
                      <SortTh view={stockView} k="min" align="center" data-guide="kritik-seviye">Kritik seviye</SortTh>
                      <th scope="col" className="px-4 py-3 text-right">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockView.visible.map((item, itemIdx) => {
                      const isLow = item.quantity <= item.minLevel;
                      return (
                        <tr key={item.id} className={rowClass(itemIdx)}>
                          <td className="px-4 py-3 font-bold">
                            {item.productName}
                            {item.productActive === false ? (
                              <span className="ml-2 rounded border border-border bg-[var(--muted-bg)] px-2 py-0.5 text-[13px] font-semibold text-muted">
                                Pasif ürün
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded border border-border bg-[var(--muted-bg)] px-2 py-1 text-[13px] text-muted">{item.categoryName}</span>
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border-2 px-3 py-1 font-bold ${
                                isLow ? "border-danger bg-[var(--danger-bg)] text-danger" : "border-success bg-[var(--success-bg)] text-success"
                              }`}
                            >
                              <Icon name={isLow ? "warning" : "check"} size={16} />
                              {item.quantity} adet{isLow ? " · düşük" : ""}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-muted tabular-nums">{item.minLevel} adet</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {canManage ? (
                                <Button mutates variant="primary" data-guide={itemIdx === 0 ? "havuz-giris" : undefined} icon={<Icon name="plus" size={20} />} onClick={() => openAdjustModal(item, "GIRIS")}>
                                  Stok ekle
                                </Button>
                              ) : null}
                              {opening?.canEdit && item.openingQty != null ? (
                                <Button mutates icon={<Icon name="settings" size={20} />} onClick={() => setOpeningProduct(item)}>
                                  Başlangıç stoğu ({item.openingQty})
                                </Button>
                              ) : null}
                              {canCount ? (
                                <Button mutates icon={<Icon name="settings" size={20} />} onClick={() => openAdjustModal(item, "DUZELTME")}>
                                  Sayım düzeltme
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager view={stockView} noun="ürün" />
            </>
          )}
        </div>
      ) : activeTab === "SKT" ? (
        <div className="overflow-hidden rounded-[var(--radius-l)] border border-border bg-surface">
          {expiry.length === 0 ? (
            <p className="px-4 py-12 text-center text-muted">
              Bu otelin deposunda son kullanma tarihi kayıtlı ürün yok. SKT, merkez depo tedarik kaydı girilirken yazılır.
            </p>
          ) : (
            <>
              <div className={TABLE_WRAP} tabIndex={0} role="region" aria-label="SKT takip tablosu">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className={THEAD}>
                      <SortTh view={expiryView} k="product">Ürün</SortTh>
                      <SortTh view={expiryView} k="date">SKT</SortTh>
                      <SortTh view={expiryView} k="status" align="center">Durum</SortTh>
                      <SortTh view={expiryView} k="qty" align="center">Kalan / gelen</SortTh>
                      <SortTh view={expiryView} k="receipt">Tedarik</SortTh>
                    </tr>
                  </thead>
                  <tbody>
                    {expiryView.visible.map((lot, i) => (
                      <tr key={lot.id} className={rowClass(i)}>
                        <td className="px-4 py-3 font-bold">{lot.productName}</td>
                        <td className="px-4 py-3 font-mono tabular-nums">{lot.expiryDate.split("-").reverse().join(".")}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block rounded border px-2 py-1 text-[13px] font-bold ${EXPIRY_TONE[lot.status]}`}>
                            {EXPIRY_LABEL[lot.status]} ·{" "}
                            {lot.daysLeft < 0 ? `${-lot.daysLeft} gün önce` : lot.daysLeft === 0 ? "bugün" : `${lot.daysLeft} gün kaldı`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-bold tabular-nums">
                          {lot.remainingQty} / {lot.qty} adet
                        </td>
                        <td className="px-4 py-3 font-mono text-muted">{lot.receiptCode ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager view={expiryView} noun="kayıt" />
            </>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-l)] border border-border bg-surface">
          {movements.length === 0 ? (
            <p className="py-12 text-center text-muted">Henüz stok hareketi kaydedilmemiş.</p>
          ) : (
            <>
              <div className={TABLE_WRAP} tabIndex={0} role="region" aria-label="Hareket geçmişi tablosu">
                <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                  <thead>
                    <tr className={THEAD}>
                      <SortTh view={movementView} k="date">Tarih / saat</SortTh>
                      <SortTh view={movementView} k="product">Ürün</SortTh>
                      <SortTh view={movementView} k="type" align="center">İşlem tipi</SortTh>
                      <SortTh view={movementView} k="change" align="center">Değişim</SortTh>
                      <SortTh view={movementView} k="after" align="center">Önce / sonra</SortTh>
                      <SortTh view={movementView} k="user">İşlemi yapan</SortTh>
                      <SortTh view={movementView} k="note">Açıklama / not</SortTh>
                    </tr>
                  </thead>
                  <tbody>
                    {movementView.visible.map((m, i) => (
                      <tr key={m.id} className={rowClass(i)}>
                        <td className="px-4 py-3 font-mono text-muted tabular-nums">
                          {new Date(m.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td className="px-4 py-3 font-bold">{m.productName}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block rounded border px-2 py-1 text-[13px] font-bold ${MOVEMENT_TONE[m.type] ?? "border-warn text-warn"}`}>
                            {m.type === "IADE" && m.refType === "MybarRequest" ? "MyBar iadesi" : m.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-bold tabular-nums">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                        <td className="px-4 py-3 text-center font-mono text-muted tabular-nums">
                          {m.previousQuantity} → {m.newQuantity}
                        </td>
                        <td className="px-4 py-3">{m.userName}</td>
                        <td className="max-w-xs truncate px-4 py-3 text-muted">{m.note || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager view={movementView} noun="hareket" />
            </>
          )}
          {movements.length < movementsTotal ? (
            <div className="flex justify-center border-t border-border p-3">
              <Button disabled={isLoading} onClick={() => void loadData(selectedHotelId || undefined, movementsPage + 1)}>
                {isLoading ? "Yükleniyor..." : `Daha eski hareketler (${movements.length} / ${movementsTotal})`}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {openingProduct ? (
        <OpeningDialog
          key={openingProduct.productId}
          product={openingProduct}
          hotelId={selectedHotelId}
          onClose={() => setOpeningProduct(null)}
          onSaved={() => {
            setOpeningProduct(null);
            void loadData(selectedHotelId);
          }}
        />
      ) : null}

      {selectedProduct ? (
        <AdjustDialog
          key={`${selectedProduct.productId}-${movementType}`}
          product={selectedProduct}
          type={movementType}
          hotelId={selectedHotelId}
          needsApproval={countNeedsApproval}
          directUntil={directUntil}
          onClose={() => setSelectedProduct(null)}
          onSaved={(pendingMessage) => {
            setSelectedProduct(null);
            setSentNote(pendingMessage ?? null);
            setCorrectionsKey((k) => k + 1);
            void loadData(selectedHotelId);
          }}
        />
      ) : null}
    </div>
  );
}

function AdjustDialog({
  product,
  type,
  hotelId,
  needsApproval,
  directUntil,
  onClose,
  onSaved,
}: {
  product: DepoStockItem;
  type: MovementType;
  hotelId: string;
  /** The count is sent to the system administrator for approval; the stock does not move yet. */
  needsApproval: boolean;
  directUntil: string | null;
  onClose: () => void;
  /** `pendingMessage`: set when the count was sent for approval instead of being booked. */
  onSaved: (pendingMessage?: string) => void;
}) {
  const titleId = useId();
  const qtyId = useId();
  const noteId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const isCount = type === "DUZELTME";
  const sendsForApproval = isCount && needsApproval;
  // Count mode: the counted quantity starts at the system balance; the difference is shown live.
  const [qty, setQty] = useState<number>(isCount ? product.quantity : 50);
  const [note, setNote] = useState("");
  const diff = qty - product.quantity;
  const reasonOk = note.trim().length >= 3;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useDialogFocus(boxRef, onClose, () => qtyRef.current);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setBusy(true);
      setError(null);
      const res = await mbFetch("/api/minibar/depo/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formHotelId: hotelId,
          productId: product.productId,
          ...(isCount ? { countedQty: qty } : { changeQuantity: qty }),
          movementType: type,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Stok güncellenemedi.");
      onSaved(data.pending ? String(data.message) : undefined);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "İşlem sırasında hata oluştu.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-dvh w-full max-w-md space-y-4 overflow-y-auto rounded-t-[var(--radius-l)] border border-border bg-surface p-5 sm:rounded-[var(--radius-l)]"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 id={titleId} className="text-lg font-bold">
            {sendsForApproval ? "Sayım düzeltme talebi" : isCount ? "Sayım düzeltme" : "Otel deposuna stok ekle"}
          </h2>
          <button
            type="button"
            aria-label="Kapat"
            onClick={onClose}
            className="inline-grid h-[var(--tap-min)] w-[var(--tap-min)] place-items-center rounded-full border border-border bg-surface text-text"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1 rounded-[var(--radius-m)] border border-border bg-[var(--muted-bg)] p-3">
            <span className="text-sm text-muted">Seçilen ürün</span>
            <p className="text-base font-bold">{product.productName}</p>
            <p className="text-sm text-muted">
              Depodaki miktar: <span className="font-bold text-text">{product.quantity} adet</span>
            </p>
          </div>

          <div>
            <label htmlFor={qtyId} className="mb-1 block text-sm font-semibold">
              {isCount ? "Sayılan miktar (adet)" : "Eklenecek miktar (adet)"}
            </label>
            {isCount ? null : (
              <div className="flex flex-wrap gap-2">
                {[20, 50, 100].map((step) => (
                  <Button key={step} onClick={() => setQty(step)}>
                    +{step}
                  </Button>
                ))}
              </div>
            )}
            <input
              ref={qtyRef}
              id={qtyId}
              type="number"
              value={qty}
              min={isCount ? 0 : 1}
              onChange={(e) => setQty(parseInt(e.target.value, 10) || 0)}
              className={`${FIELD} mt-2 font-bold`}
              required
            />
            {isCount ? (
              <p className="mt-2 text-sm text-muted" aria-live="polite">
                Fark:{" "}
                <span className={`font-bold ${diff < 0 ? "text-danger" : diff > 0 ? "text-success" : "text-text"}`}>
                  {diff > 0 ? `+${diff}` : diff} adet
                </span>{" "}
                (sistemde {product.quantity}, sayılan {qty})
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor={noteId} className="mb-1 block text-sm font-semibold">
              {sendsForApproval ? "Açıklama (zorunlu, en az 3 karakter)" : isCount ? "Sebep (zorunlu, en az 3 karakter)" : "Açıklama / fiş / irsaliye no (isteğe bağlı)"}
            </label>
            <input
              id={noteId}
              type="text"
              placeholder={isCount ? "Örn: Aylık sayım, kırık ürün, kayıp" : "Örn: İrsaliye #4829 veya haftalık depo sevkiyatı"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={FIELD}
              required={isCount}
              minLength={isCount ? 3 : undefined}
              maxLength={200}
            />
          </div>

          {sendsForApproval ? (
            <p className="rounded-[var(--radius-m)] border border-info bg-[var(--info-bg)] p-3 text-sm text-text">
              Bu düzeltme sistem yöneticisinin onayına gönderilir. Onaylanana kadar stok değişmez.
            </p>
          ) : null}
          {isCount && !sendsForApproval && directUntil ? (
            <p className="rounded-[var(--radius-m)] border border-info bg-[var(--info-bg)] p-3 text-sm text-text">
              Bu düzeltme onay beklemeden stoğa işlenir. Onaysız düzeltme süresi{" "}
              {new Date(directUntil).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })} günü sona
              erer; sonrasında düzeltmeler sistem yöneticisinin onayına gider.
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <Button onClick={onClose} disabled={busy}>
              Vazgeç
            </Button>
            <Button mutates variant="primary" type="submit" disabled={busy || (isCount ? diff === 0 || qty < 0 || !reasonOk : qty <= 0)}>
              {busy ? "Kaydediliyor..." : sendsForApproval ? "Onaya gönder" : isCount ? "Sayımı kaydet" : "Onayla ve stoğu güncelle"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Corrects the opening quantity (1000) of one product during the first week. */
function OpeningDialog({
  product,
  hotelId,
  onClose,
  onSaved,
}: {
  product: DepoStockItem;
  hotelId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const titleId = useId();
  const qtyId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const previous = product.openingQty ?? 0;
  const [qty, setQty] = useState<number>(previous);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const diff = qty - previous;

  useDialogFocus(boxRef, onClose, () => qtyRef.current);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setBusy(true);
      setError(null);
      const res = await mbFetch("/api/minibar/stock/opening", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formHotelId: hotelId, productId: product.productId, qty }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Başlangıç stoğu güncellenemedi.");
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "İşlem sırasında hata oluştu.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-dvh w-full max-w-md space-y-4 overflow-y-auto rounded-t-[var(--radius-l)] border border-border bg-surface p-5 sm:rounded-[var(--radius-l)]"
      >
        <h2 id={titleId} className="border-b border-border pb-3 text-lg font-bold">
          Başlangıç stoğunu düzelt
        </h2>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1 rounded-[var(--radius-m)] border border-border bg-[var(--muted-bg)] p-3">
            <p className="text-base font-bold">{product.productName}</p>
            <p className="text-sm text-muted">
              Kayıtlı başlangıç: <span className="font-bold text-text">{previous} adet</span> · depoda şu an{" "}
              <span className="font-bold text-text">{product.quantity} adet</span>
            </p>
          </div>
          <div>
            <label htmlFor={qtyId} className="mb-1 block text-sm font-semibold">
              Gerçek başlangıç miktarı (adet)
            </label>
            <input
              ref={qtyRef}
              id={qtyId}
              type="number"
              min={0}
              max={100000}
              value={qty}
              onChange={(e) => setQty(parseInt(e.target.value, 10) || 0)}
              className={`${FIELD} font-bold`}
              required
            />
            <p className="mt-2 text-sm text-muted" aria-live="polite">
              Depodaki miktar {diff > 0 ? `+${diff}` : diff} adet değişir; yeni miktar{" "}
              <span className="font-bold text-text">{product.quantity + diff} adet</span>.
            </p>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <Button onClick={onClose} disabled={busy}>
              Vazgeç
            </Button>
            <Button mutates variant="primary" type="submit" disabled={busy || diff === 0 || qty < 0 || product.quantity + diff < 0}>
              {busy ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
