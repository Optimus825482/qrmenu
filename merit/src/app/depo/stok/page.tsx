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
  lastUpdated: string;
}

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
  const [activeTab, setActiveTab] = useState<"STOCK" | "MOVEMENTS">("STOCK");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [selectedProduct, setSelectedProduct] = useState<DepoStockItem | null>(null);
  const [movementType, setMovementType] = useState<MovementType>("GIRIS");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = useCallback(async (hotelId?: string) => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const url = hotelId
        ? `/api/minibar/depo/stock?hotelId=${encodeURIComponent(hotelId)}`
        : "/api/minibar/depo/stock";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Stok bilgileri alınamadı.");
      const data = await res.json();
      setStockItems(data.stockItems || []);
      setMovements(data.movements || []);
      setHotels(data.hotels || []);
      if (!hotelId && data.selectedHotelId) {
        setSelectedHotelId(data.selectedHotelId);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Bağlantı hatası.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  const handleHotelChange = (id: string) => {
    setSelectedHotelId(id);
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
            Zimmet havuzu
          </h1>
          <p className="text-sm text-muted">Depo sorumlusu zimmet takibi, otel bazlı ortak havuz</p>
        </div>
        {hotels.length > 1 ? (
          <select
            aria-label="Otel"
            value={selectedHotelId}
            onChange={(e) => handleHotelChange(e.target.value)}
            className={`${FIELD} w-auto font-semibold`}
          >
            {hotels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
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

      <div className="flex items-start gap-3 rounded-[var(--radius-l)] border border-success bg-[var(--success-bg)] p-4 text-sm text-text">
        <Icon name="info" size={24} />
        <p>
          <strong>Otel bazlı ortak zimmet kuralı:</strong> Bu ekrandan otele tanımlanan zimmet stoğu (örneğin 100 Kola), o oteldeki tüm kat
          görevlilerinin ortak havuzudur. Kat görevlisi minibar dolumu yaptıkça havuzdan otomatik düşer.
        </p>
      </div>

      {errorMsg ? (
        <div role="alert" className="rounded-[var(--radius-l)] border border-danger bg-[var(--danger-bg)] p-4 text-sm text-danger">
          {errorMsg}
        </div>
      ) : null}

      <div data-guide="hareketler" className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <Segmented
          label="Havuz bölümleri"
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: "STOCK", label: `Mevcut stok (${filteredItems.length})`, icon: <Icon name="box" size={20} /> },
            { value: "MOVEMENTS", label: `Hareket geçmişi (${movements.length})`, icon: <Icon name="list" size={20} /> },
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
                    <th scope="col" className="px-4 py-3 text-center">Mevcut havuz stoğu</th>
                    <th scope="col" data-guide="kritik-seviye" className="px-4 py-3 text-center">Kritik seviye</th>
                    <th scope="col" className="px-4 py-3 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredItems.map((item, itemIdx) => {
                    const isLow = item.quantity <= item.minLevel;
                    return (
                      <tr key={item.id}>
                        <td className="px-4 py-3 font-bold">{item.productName}</td>
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
                            <Button mutates variant="primary" data-guide={itemIdx === 0 ? "havuz-giris" : undefined} icon={<Icon name="plus" size={20} />} onClick={() => openAdjustModal(item, "GIRIS")}>
                              Zimmet ekle
                            </Button>
                            <Button mutates icon={<Icon name="settings" size={20} />} onClick={() => openAdjustModal(item, "DUZELTME")}>
                              Düzenle
                            </Button>
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
        </div>
      )}

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
  const [qty, setQty] = useState<number>(type === "GIRIS" ? 50 : 0);
  const [note, setNote] = useState("");
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
          changeQuantity: qty,
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
            {type === "GIRIS" ? "Zimmet stoğu ekle" : "Stok düzeltme / sayım farkı"}
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
              Mevcut havuz stoğu: <span className="font-bold text-text">{product.quantity} adet</span>
            </p>
          </div>

          <div>
            <label htmlFor={qtyId} className="mb-1 block text-sm font-semibold">
              {type === "GIRIS" ? "Eklenecek miktar (adet)" : "Değişim miktarı (pozitif veya negatif)"}
            </label>
            <div className="flex flex-wrap gap-2">
              {[20, 50, 100].map((step) => (
                <Button key={step} onClick={() => setQty(step)}>
                  +{step}
                </Button>
              ))}
            </div>
            <input
              ref={qtyRef}
              id={qtyId}
              type="number"
              value={qty}
              onChange={(e) => setQty(parseInt(e.target.value, 10) || 0)}
              className={`${FIELD} mt-2 font-bold`}
              required
            />
          </div>

          <div>
            <label htmlFor={noteId} className="mb-1 block text-sm font-semibold">
              Açıklama / fiş / irsaliye no (isteğe bağlı)
            </label>
            <input
              id={noteId}
              type="text"
              placeholder="Örn: İrsaliye #4829 veya haftalık depo sevkiyatı"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={FIELD}
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
            <Button mutates variant="primary" type="submit" disabled={busy || qty === 0}>
              {busy ? "Kaydediliyor..." : "Onayla ve stoğu güncelle"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
