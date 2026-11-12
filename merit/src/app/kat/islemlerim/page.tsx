"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { askReason } from "@/components/ui/reason";
import type { RoomCheckHistoryItem } from "@/modules/minibar/server/minibarTypes";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";

export default function KatIslemlerimPage() {
  const [items, setItems] = useState<RoomCheckHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingTx, setEditingTx] = useState<RoomCheckHistoryItem | null>(null);
  const [editQty, setEditQty] = useState<Record<string, number>>({});
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [correctionModal, setCorrectionModal] = useState<{
    tx: RoomCheckHistoryItem;
    actionType: "SILME" | "DUZELTME";
  } | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionQty, setCorrectionQty] = useState<Record<string, number>>({});

  const loadChecks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/minibar/my-checks");
      const json = await res.json();
      if (!res.ok) throw new Error((json as { error?: string })?.error ?? "İşlemler alınamadı.");
      const checks: RoomCheckHistoryItem[] = Array.isArray(json)
        ? json
        : Array.isArray((json as { checks?: RoomCheckHistoryItem[] })?.checks)
          ? (json as { checks: RoomCheckHistoryItem[] }).checks
          : [];
      setItems(checks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadChecks(), 0);
    return () => clearTimeout(t);
  }, [loadChecks]);

  const handleDelete = async (tx: RoomCheckHistoryItem) => {
    if (!tx.isToday) {
      setCorrectionModal({ tx, actionType: "SILME" });
      setCorrectionReason("");
      return;
    }

    const ok = await confirm({
      title: `Oda ${tx.roomNumber} kontrol kaydı silinsin mi?`,
      message: "Eklenen ürünler otel deposuna geri eklenecektir.",
      confirmLabel: "Sil",
      cancelLabel: "Vazgeç",
      danger: true,
    });
    if (!ok) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/minibar/my-checks/${tx.id}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Silinemedi.");
      await loadChecks();
      notify.success(json.message ?? "Kayıt silindi.");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Silme hatası");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (tx: RoomCheckHistoryItem) => {
    const map: Record<string, number> = {};
    for (const it of tx.items) {
      map[it.productId] = it.added;
    }
    if (!tx.isToday) {
      setCorrectionModal({ tx, actionType: "DUZELTME" });
      setCorrectionReason("");
      setCorrectionQty(map);
      return;
    }
    setEditingTx(tx);
    setEditQty(map);
    setEditNote(tx.note ?? "");
  };

  const handleSaveEdit = async () => {
    if (!editingTx) return;
    setSaving(true);
    try {
      const updatedItems = Object.entries(editQty).map(([productId, qty]) => ({
        productId,
        qty,
      }));
      const res = await fetch(`/api/minibar/my-checks/${editingTx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updatedItems, note: editNote }),
      });
      const json = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Güncellenemedi.");
      setEditingTx(null);
      await loadChecks();
      notify.success(json.message ?? "İşlem güncellendi.");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Güncelleme hatası");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitCorrection = async () => {
    if (!correctionModal) return;
    let reason = correctionReason.trim();
    if (!reason) {
      const picked = await askReason({
        title: `Oda ${correctionModal.tx.roomNumber} geçmiş kayıt düzeltme gerekçesi`,
        reasons: ["Yanlış oda seçildi", "Adet hatalı girildi", "Mükerrer kayıt"],
        minLength: 3,
        confirmLabel: "Onaya Gönder",
      });
      if (!picked) return;
      reason = picked;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/minibar/corrections/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: correctionModal.tx.id,
          actionType: correctionModal.actionType,
          reason,
          proposedData:
            correctionModal.actionType === "DUZELTME" ? correctionQty : undefined,
        }),
      });
      const json = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Talep gönderilemedi.");
      setCorrectionModal(null);
      notify.success(json.message ?? "Düzeltme talebi yönetici onayına gönderildi.");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Talep hatası");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text">

      <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/kat"
              style={{ minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" }}
              className="inline-flex items-center justify-center gap-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-text hover:bg-bg"
            >
              <Icon name="arrow-left" size={16} />
              Geri
            </Link>
            <div>
              <h1 className="text-lg font-bold">İşlemlerim ve Oda Kontrol Kayıtları</h1>
              <p className="text-xs text-muted">
                Bugünkü kayıtları doğrudan düzenleyebilir, geçmiş kayıtlar için yönetici onaylı düzeltme isteyebilirsiniz
              </p>
            </div>
          </div>

          <Link
            href="/kat/duzeltme-onay"
            style={{ minHeight: "var(--tap-action)" }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-warn/50 bg-warn/15 px-3 py-2 text-xs font-semibold text-warn hover:bg-warn/25"
          >
            <Icon name="shield" size={16} />
            Bekleyen Yönetici Onayları
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 space-y-4">
        {loading ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
            İşlem geçmişi yükleniyor...
          </div>
        ) : error ? (
          <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-5 text-sm text-danger">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
            Henüz kayıtlı oda kontrol işleminiz bulunmuyor.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((tx) => (
              <div
                key={tx.id}
                className="rounded-2xl border border-border bg-surface p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-text">Oda {tx.roomNumber}</span>
                      <span className="text-xs text-muted">({tx.floorName})</span>
                      {tx.isToday ? (
                        <span className="rounded-full bg-ok/15 px-2.5 py-0.5 text-xs font-bold text-ok">
                          Bugün
                        </span>
                      ) : (
                        <span className="rounded-full bg-warn/15 px-2.5 py-0.5 text-xs font-bold text-warn">
                          Geçmiş Tarihli (Yönetici Onaylı)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {new Date(tx.occurredAt).toLocaleString("tr-TR")} · {tx.typeLabel}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-mutates=""
                      onClick={() => openEdit(tx)}
                      style={{ minHeight: "var(--tap-action)" }}
                      className="inline-flex items-center gap-1 rounded-xl border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface"
                    >
                      <Icon name="edit" size={14} />
                      {tx.isToday ? "Değiştir" : "Düzeltme Talep Et"}
                    </button>
                    <button
                      type="button"
                      data-mutates=""
                      onClick={() => void handleDelete(tx)}
                      disabled={saving}
                      style={{ minHeight: "var(--tap-action)" }}
                      className="inline-flex items-center gap-1 rounded-xl border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger/20"
                    >
                      <Icon name="trash" size={14} />
                      {tx.isToday ? "Sil" : "Silme Talep Et"}
                    </button>
                  </div>
                </div>

                {tx.items.length === 0 ? (
                  <p className="text-xs text-muted italic">Sarfiyat Yok — Minibar Tam</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {tx.items.map((it) => (
                      <span
                        key={it.productId}
                        className="rounded-lg border border-border bg-bg px-2.5 py-1 text-xs text-text"
                      >
                        {it.productName}: <strong className="text-ok">+{it.added}</strong>
                      </span>
                    ))}
                  </div>
                )}

                {tx.note ? <p className="text-xs text-muted">Not: {tx.note}</p> : null}
              </div>
            ))}
          </div>
        )}
      </main>

      {editingTx ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-tx-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface text-text p-5 space-y-4">
            <h2 id="edit-tx-title" className="text-base font-bold text-text">
              Oda {editingTx.roomNumber} — Bugünkü Kaydı Düzenle
            </h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {editingTx.items.map((it) => (
                <div
                  key={it.productId}
                  className="flex items-center justify-between rounded-xl border border-border bg-bg px-3 py-2"
                >
                  <span className="text-xs font-medium text-text">{it.productName}</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    aria-label={`${it.productName} adet`}
                    value={editQty[it.productId] ?? 0}
                    onChange={(e) =>
                      setEditQty((prev) => ({
                        ...prev,
                        [it.productId]: Math.max(0, Number(e.target.value)),
                      }))
                    }
                    className="min-h-11 w-20 rounded-xl border border-border bg-surface px-2 text-center text-sm font-bold tabular-nums text-text"
                  />
                </div>
              ))}
            </div>
            <input
              type="text"
              aria-label="Açıklama notu"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="Açıklama notu..."
              className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm text-text placeholder:text-muted"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                style={{ minHeight: "var(--tap-action)" }}
                className="rounded-xl border border-border bg-bg px-4 py-2 text-xs font-semibold text-text hover:bg-surface"
              >
                İptal
              </button>
              <button
                type="button"
                data-mutates=""
                onClick={() => void handleSaveEdit()}
                disabled={saving}
                style={{ minHeight: "var(--tap-action)" }}
                className="rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white hover:opacity-95 disabled:opacity-50"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {correctionModal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="correction-tx-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-warn/40 bg-surface text-text p-5 space-y-4">
            <h2 id="correction-tx-title" className="text-base font-bold text-warn">
              Geçmiş Tarihli Kayıt — Yönetici Onay Talebi ({correctionModal.actionType})
            </h2>
            <p className="text-xs text-muted">
              Geçmiş tarihli oda kontrol kayıtları yalnızca Sistem Yöneticisi onayı ile değiştirilebilir veya silinebilir.
            </p>
            {correctionModal.actionType === "DUZELTME" ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {correctionModal.tx.items.map((it) => (
                  <div
                    key={it.productId}
                    className="flex items-center justify-between rounded-xl border border-border bg-bg px-3 py-2"
                  >
                    <span className="text-xs text-text">{it.productName}</span>
                    <input
                      type="number"
                      min={0}
                      aria-label={`${it.productName} önerilen adet`}
                      value={correctionQty[it.productId] ?? 0}
                      onChange={(e) =>
                        setCorrectionQty((prev) => ({
                          ...prev,
                          [it.productId]: Math.max(0, Number(e.target.value)),
                        }))
                      }
                      className="min-h-11 w-20 rounded-xl border border-border bg-surface px-2 text-center text-sm font-bold tabular-nums text-text"
                    />
                  </div>
                ))}
              </div>
            ) : null}
            <textarea
              rows={3}
              aria-label="Düzeltme veya silme gerekçesi"
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              placeholder="Düzeltme veya silme gerekçenizi detaylı yazın..."
              className="w-full rounded-xl border border-border bg-bg p-3 text-sm text-text placeholder:text-muted"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCorrectionModal(null)}
                style={{ minHeight: "var(--tap-action)" }}
                className="rounded-xl border border-border bg-bg px-4 py-2 text-xs font-semibold text-text hover:bg-surface"
              >
                Vazgeç
              </button>
              <button
                type="button"
                data-mutates=""
                onClick={() => void handleSubmitCorrection()}
                disabled={saving}
                style={{ minHeight: "var(--tap-action)" }}
                className="rounded-xl bg-warn px-4 py-2 text-xs font-bold text-bg hover:opacity-95 disabled:opacity-50"
              >
                Yönetici Onayına Gönder
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
