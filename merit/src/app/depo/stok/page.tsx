"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/icons/Icon";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { useDialogFocus } from "@/components/ui/useDialogFocus";

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
  "min-h-[var(--tap-std)] w-full rounded-[var(--radius-m)] border border-border bg-surface px-3 text-base text-text placeholder:text-muted";
const LINK_BUTTON =
  "inline-flex min-h-[var(--tap-std)] items-center gap-2 rounded-[var(--radius-m)] border border-border bg-surface px-4 text-sm font-semibold text-text";

export default function DepoStokPage() {
  const [hotels, setHotels] = useState<HotelItem[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<string>("");
  const [stockItems, setStockItems] = useState<DepoStockItem[]>([]);
  const [movements, setMovements] = useState<StockMovementItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"STOCK" | "SKT" | "MOVEMENTS">("STOCK");
  const [expiry, setExpiry] = useState<ExpiryItem[]>([]);
  const [canManage, setCanManage] = useState(false);
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

  return (
    <div className="flex flex-col gap-4 text-text">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/depo" className={LINK_BUTTON}>
          <Icon name="arrow-left" size={20} />
          Geri
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Icon name="box" size={24} />
            Otel deposu
          </h1>
          <p className="text-sm text-muted">Minibar stok takibi: otelin deposundaki ürünler, SKT ve hareketler</p>
        </div>
        {hotels.length > 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 shadow-sm">
            <span className="text-xs font-bold text-muted whitespace-nowrap flex items-center gap-1">
              <Icon name="building" size={16} />
              Otel:
            </span>
            {hotels.length > 1 ? (
              <select
                aria-label="Otel Seçimi"
                value={selectedHotelId}
                onChange={(e) => handleHotelChange(e.target.value)}
                className="bg-transparent text-sm font-bold text-text focus:outline-none cursor-pointer"
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
        <Link href="/depo/doluluk-yukle" className={LINK_BUTTON}>
          <Icon name="chart" size={20} />
          Doluluk girişi
        </Link>
        <Link href="/depo/raporlar" className={LINK_BUTTON}>
          <Icon name="trending" size={20} />
          Raporlar
        </Link>
        <Link href="/depo/tanimlar" className={LINK_BUTTON}>
          <Icon name="settings" size={20} />
          Tanımlamalar ve denetim
        </Link>
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
            onChange={(e) => setSearchQuery(e.target.value)}
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
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Mevcut stok tablosu">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-[var(--muted-bg)] font-semibold text-muted">
                    <th scope="col" className="px-4 py-3">Ürün adı</th>
                    <th scope="col" className="px-4 py-3">Kategori</th>
                    <th scope="col" className="px-4 py-3 text-center">Depodaki miktar</th>
                    <th scope="col" data-guide="kritik-seviye" className="px-4 py-3 text-center">Kritik seviye</th>
                    <th scope="col" className="px-4 py-3 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredItems.map((item, itemIdx) => {
                    const isLow = item.quantity <= item.minLevel;
                    return (
                      <tr key={item.id}>
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
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border-2 px-3 py-1 font-bold ${
                              isLow ? "border-danger bg-[var(--danger-bg)] text-danger" : "border-success bg-[var(--success-bg)] text-success"
                            }`}
                          >
                            <Icon name={isLow ? "warning" : "check"} size={16} />
                            {item.quantity} adet{isLow ? " · düşük" : ""}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-muted">{item.minLevel} adet</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
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
          )}
        </div>
      ) : activeTab === "SKT" ? (
        <div className="overflow-hidden rounded-[var(--radius-l)] border border-border bg-surface">
          {expiry.length === 0 ? (
            <p className="px-4 py-12 text-center text-muted">
              Bu otelin deposunda son kullanma tarihi kayıtlı ürün yok. SKT, merkez depo tedarik kaydı girilirken yazılır.
            </p>
          ) : (
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="SKT takip tablosu">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-[var(--muted-bg)] font-semibold text-muted">
                    <th scope="col" className="px-4 py-3">Ürün</th>
                    <th scope="col" className="px-4 py-3">SKT</th>
                    <th scope="col" className="px-4 py-3 text-center">Durum</th>
                    <th scope="col" className="px-4 py-3 text-center">Kalan / gelen</th>
                    <th scope="col" className="px-4 py-3">Tedarik</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {expiry.map((lot) => (
                    <tr key={lot.id}>
                      <td className="px-4 py-3 font-bold">{lot.productName}</td>
                      <td className="px-4 py-3 font-mono">{lot.expiryDate.split("-").reverse().join(".")}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block rounded border px-2 py-1 text-[13px] font-bold ${EXPIRY_TONE[lot.status]}`}>
                          {EXPIRY_LABEL[lot.status]} ·{" "}
                          {lot.daysLeft < 0 ? `${-lot.daysLeft} gün önce` : lot.daysLeft === 0 ? "bugün" : `${lot.daysLeft} gün kaldı`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-bold">
                        {lot.remainingQty} / {lot.qty} adet
                      </td>
                      <td className="px-4 py-3 font-mono text-muted">{lot.receiptCode ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-l)] border border-border bg-surface">
          {movements.length === 0 ? (
            <p className="py-12 text-center text-muted">Henüz stok hareketi kaydedilmemiş.</p>
          ) : (
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Hareket geçmişi tablosu">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-[var(--muted-bg)] font-semibold text-muted">
                    <th scope="col" className="px-4 py-3">Tarih / saat</th>
                    <th scope="col" className="px-4 py-3">Ürün</th>
                    <th scope="col" className="px-4 py-3 text-center">İşlem tipi</th>
                    <th scope="col" className="px-4 py-3 text-center">Değişim</th>
                    <th scope="col" className="px-4 py-3 text-center">Önce / sonra</th>
                    <th scope="col" className="px-4 py-3">İşlemi yapan</th>
                    <th scope="col" className="px-4 py-3">Açıklama / not</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-3 font-mono text-muted">
                        {new Date(m.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="px-4 py-3 font-bold">{m.productName}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block rounded border px-2 py-1 text-[13px] font-bold ${MOVEMENT_TONE[m.type] ?? "border-warn text-warn"}`}>
                          {m.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-bold">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                      <td className="px-4 py-3 text-center font-mono text-muted">
                        {m.previousQuantity} → {m.newQuantity}
                      </td>
                      <td className="px-4 py-3">{m.userName}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-muted">{m.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
          onClose={() => setSelectedProduct(null)}
          onSaved={() => {
            setSelectedProduct(null);
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
  onClose,
  onSaved,
}: {
  product: DepoStockItem;
  type: MovementType;
  hotelId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const titleId = useId();
  const qtyId = useId();
  const noteId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const isCount = type === "DUZELTME";
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
      const res = await fetch("/api/minibar/depo/stock", {
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
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 id={titleId} className="text-lg font-bold">
            {isCount ? "Sayım düzeltme" : "Otel deposuna stok ekle"}
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
              {isCount ? "Sebep (zorunlu, en az 3 karakter)" : "Açıklama / fiş / irsaliye no (isteğe bağlı)"}
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
              {busy ? "Kaydediliyor..." : isCount ? "Sayımı kaydet" : "Onayla ve stoğu güncelle"}
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
      const res = await fetch("/api/minibar/stock/opening", {
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
