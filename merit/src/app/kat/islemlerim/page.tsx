"use client";

import { mbFetch } from "@/modules/minibar/ui/mbFetch";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { BackLink } from "@/components/staff/BackLink";
import { useCanViewPath } from "@/components/staff/StaffScreens";
import { askReason } from "@/components/ui/reason";
import type { RoomCheckHistoryItem } from "@/modules/minibar/server/minibarTypes";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { useBackCloses } from "@/shell/useBackCloses";
import { askLeave, useBeforeUnload } from "@/shell/useLeaveGuard";

/** Quantities that differ from the record's own (an edit or a proposed correction was typed). */
function qtyChanged(tx: RoomCheckHistoryItem, qty: Record<string, number>): boolean {
  return tx.items.some((it) => (qty[it.productId] ?? 0) !== it.added);
}

/** A row of the user's own list: minibar records, DND marks and MMD records (`/api/minibar/my-checks`). */
type MyRecord = RoomCheckHistoryItem & { kind?: "ISLEM" | "DND" | "MMD" };

/** Only room check records are changed here: an addition can be edited or cancelled, "Sarfiyat Yok" cancelled. */
const canEditRecord = (tx: MyRecord) => (tx.kind ?? "ISLEM") === "ISLEM" && tx.type === "SETUP_KONTROL";
const canDeleteRecord = (tx: MyRecord) =>
  (tx.kind ?? "ISLEM") === "ISLEM" && (tx.type === "SETUP_KONTROL" || tx.type === "SARFIYAT_YOK");

/** All of one user's records for one room on one business day: the unit of the list and of the cancel button. */
type RoomGroup = {
  key: string;
  roomId: string;
  roomNumber: string;
  floorName: string;
  dateStr: string;
  isToday: boolean;
  firstAt: string;
  lastAt: string;
  /** Every record of the group, newest first (as the server sends them). */
  records: MyRecord[];
  /** Products added to the room that day, summed over the records. */
  products: { productId: string; productName: string; added: number }[];
  /** Records the group cancel removes (today) or asks to remove (past days). */
  cancellable: MyRecord[];
};

function groupByRoomDay(items: MyRecord[]): RoomGroup[] {
  const map = new Map<string, RoomGroup>();
  for (const tx of items) {
    const key = `${tx.roomId}|${tx.dateStr}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        roomId: tx.roomId,
        roomNumber: tx.roomNumber,
        floorName: tx.floorName,
        dateStr: tx.dateStr,
        isToday: tx.isToday,
        firstAt: tx.occurredAt,
        lastAt: tx.occurredAt,
        records: [],
        products: [],
        cancellable: [],
      };
      map.set(key, g);
    }
    g.records.push(tx);
    if (tx.occurredAt < g.firstAt) g.firstAt = tx.occurredAt;
    if (tx.occurredAt > g.lastAt) g.lastAt = tx.occurredAt;
    if (canDeleteRecord(tx)) g.cancellable.push(tx);
    for (const it of tx.items) {
      const row = g.products.find((p) => p.productId === it.productId);
      if (row) row.added += it.added;
      else g.products.push({ productId: it.productId, productName: it.productName, added: it.added });
    }
  }
  return [...map.values()]
    .map((g) => ({ ...g, products: g.products.filter((p) => p.added > 0) }))
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("tr-TR", { timeZone: "Europe/Nicosia", hour: "2-digit", minute: "2-digit" });
const dayOf = (dateStr: string) => dateStr.split("-").reverse().join(".");

/** Records without products (DND, MMD, Sarfiyat Yok) stay visible as their own lines inside the group. */
const isMarkRecord = (tx: MyRecord) => tx.items.length === 0 || (tx.kind ?? "ISLEM") !== "ISLEM";

const BADGE_TONE: Record<RoomCheckHistoryItem["typeBadgeColor"], string> = {
  emerald: "border-ok/40 bg-ok/15 text-ok",
  slate: "border-border bg-bg text-text",
  amber: "border-accent/40 bg-accent/10 text-accent",
  yellow: "border-warn/40 bg-warn/15 text-warn",
};

/** What an empty product list means for this record. */
function emptyText(tx: MyRecord): string {
  if (tx.kind === "DND") return "Oda DND olarak işaretlendi.";
  if (tx.kind === "MMD") return "Misafir müsait değildi; odaya girilmedi.";
  if (tx.type === "SARFIYAT_YOK") return "Sarfiyat Yok — Minibar Tam";
  return "Ürün yok.";
}

export default function KatIslemlerimPage() {
  const canView = useCanViewPath();
  const approvalsHref = "/kat/duzeltme-onay";
  const [items, setItems] = useState<MyRecord[]>([]);
  const [range, setRange] = useState<"today" | "all">("today");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingTx, setEditingTx] = useState<RoomCheckHistoryItem | null>(null);
  const [editQty, setEditQty] = useState<Record<string, number>>({});
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);

  // A correction of a past-day record's quantities (the cancel of a whole room group has its own flow).
  const [correctionModal, setCorrectionModal] = useState<{ tx: RoomCheckHistoryItem } | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionQty, setCorrectionQty] = useState<Record<string, number>>({});

  const loadChecks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await mbFetch("/api/minibar/my-checks");
      const json = await res.json();
      if (!res.ok) throw new Error((json as { error?: string })?.error ?? "İşlemler alınamadı.");
      const checks: MyRecord[] = Array.isArray(json)
        ? json
        : Array.isArray((json as { checks?: MyRecord[] })?.checks)
          ? (json as { checks: MyRecord[] }).checks
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

  /** Same business day: cancels every record of the room group in one go. Past days: asks the Oda Servisi Sorumlusu to. */
  const handleCancelGroup = async (g: RoomGroup) => {
    const ids = g.cancellable.map((tx) => tx.id);
    if (ids.length === 0) return;
    if (g.isToday) {
      const ok = await confirm({
        title: `Oda ${g.roomNumber} kayıtları iptal edilsin mi?`,
        message: `Bugün bu odaya yapılan ${ids.length} kayıt iptal edilir; eklenen ürünler otel deposuna geri eklenir.`,
        confirmLabel: "İptal Et",
        cancelLabel: "Vazgeç",
        danger: true,
      });
      if (!ok) return;
      setSaving(true);
      try {
        const res = await mbFetch("/api/minibar/my-checks/batch-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactionIds: ids }),
        });
        const json = (await res.json()) as { message?: string; error?: string };
        if (!res.ok) throw new Error(json.error ?? "İptal edilemedi.");
        await loadChecks();
        notify.success(json.message ?? "Kayıtlar iptal edildi.");
      } catch (e) {
        notify.error(e instanceof Error ? e.message : "İptal hatası");
      } finally {
        setSaving(false);
      }
      return;
    }
    const reason = await askReason({
      title: `Oda ${g.roomNumber} · ${dayOf(g.dateStr)} kayıtları için iptal talebi`,
      message: "Geçmiş günün kayıtları Oda Servisi Sorumlusu onayıyla iptal edilir.",
      reasons: ["Yanlış oda seçildi", "Adet hatalı girildi", "Mükerrer kayıt"],
      minLength: 5,
      confirmLabel: "İptal Talebi Gönder",
      danger: true,
    });
    if (!reason) return;
    setSaving(true);
    try {
      const res = await mbFetch("/api/minibar/corrections/request-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionIds: ids, reason }),
      });
      const json = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Talep gönderilemedi.");
      await loadChecks();
      notify.success(json.message ?? "İptal talebi Oda Servisi Sorumlusu onayına gönderildi.");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Talep hatası");
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
      setCorrectionModal({ tx });
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
      const res = await mbFetch(`/api/minibar/my-checks/${editingTx.id}`, {
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
      const res = await mbFetch("/api/minibar/corrections/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: correctionModal.tx.id,
          actionType: "DUZELTME",
          reason,
          proposedData: correctionQty,
        }),
      });
      const json = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Talep gönderilemedi.");
      setCorrectionModal(null);
      await loadChecks();
      notify.success(json.message ?? "Düzeltme talebi Oda Servisi Sorumlusu onayına gönderildi.");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Talep hatası");
    } finally {
      setSaving(false);
    }
  };

  const todayGroups = groupByRoomDay(items.filter((tx) => tx.isToday));
  const allGroups = groupByRoomDay(items);
  const shown = range === "today" ? todayGroups : allGroups;

  // Unsaved input in the open dialog: closing it (button or the phone's back) asks first (D4/D6).
  const editDirty = editingTx !== null && (qtyChanged(editingTx, editQty) || editNote !== (editingTx.note ?? ""));
  const correctionDirty =
    correctionModal !== null && (correctionReason.trim() !== "" || qtyChanged(correctionModal.tx, correctionQty));
  useBeforeUnload(editDirty || correctionDirty);
  const closeEdit = async (): Promise<boolean> => {
    if (editDirty && !(await askLeave())) return false;
    setEditingTx(null);
    return true;
  };
  const closeCorrection = async (): Promise<boolean> => {
    if (correctionDirty && !(await askLeave())) return false;
    setCorrectionModal(null);
    return true;
  };
  useBackCloses(editingTx !== null, closeEdit);
  useBackCloses(correctionModal !== null, closeCorrection);

  return (
    <div className="min-h-screen bg-bg text-text">

      <header className="sticky top-[var(--staff-head-h,0px)] z-20 border-b border-border bg-bg/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BackLink />
            <div className="min-w-0">
              <h1 className="text-lg font-bold">İşlemlerim ve Oda Kontrol Kayıtları</h1>
              <p className="text-xs text-muted">
                Kayıtlar odaya göre gruplanır. Bugünkü kayıtları iptal edebilir, geçmiş günler için Oda Servisi
                Sorumlusu onaylı iptal talebi gönderebilirsiniz
              </p>
            </div>
          </div>

          {canView(approvalsHref) ? (
            <Link
              href={approvalsHref}
              style={{ minHeight: "var(--tap-action)" }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-warn/50 bg-warn/15 px-3 py-2 text-xs font-semibold text-warn hover:bg-warn/25"
            >
              <Icon name="shield" size={16} />
              Bekleyen Talepler ve Onaylar
            </Link>
          ) : null}
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
        ) : (
          <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tarih aralığı">
            {(
              [
                ["today", `Bugün (${todayGroups.length})`],
                ["all", `Tümü (${allGroups.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={range === key}
                onClick={() => setRange(key)}
                style={{ minHeight: "var(--tap-action)" }}
                className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                  range === key ? "border-accent bg-accent text-white" : "border-border bg-surface text-text hover:bg-bg"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
            {range === "today" ? "Bugün kayıtlı işleminiz bulunmuyor." : "Henüz kayıtlı işleminiz bulunmuyor."}
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map((g) => {
              const marks = g.records.filter(isMarkRecord);
              const withItems = g.records.filter((tx) => !isMarkRecord(tx));
              const pendingAll =
                g.cancellable.length > 0 && g.cancellable.every((tx) => tx.pendingCorrection?.actionType === "SILME");
              const times =
                timeOf(g.firstAt) === timeOf(g.lastAt) ? timeOf(g.firstAt) : `${timeOf(g.firstAt)} – ${timeOf(g.lastAt)}`;
              return (
                <div key={g.key} data-testid="oda-grubu" className="rounded-2xl border border-border bg-surface p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span className="font-semibold text-text">{dayOf(g.dateStr)}</span>
                        <span className="tabular-nums">{times}</span>
                        {g.isToday ? (
                          <span className="rounded-full bg-ok/15 px-2.5 py-0.5 text-xs font-bold text-ok">Bugün</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 flex items-center gap-2">
                        <span className="text-base font-bold text-text">Oda {g.roomNumber}</span>
                        <span className="text-xs text-muted">({g.floorName})</span>
                      </p>
                    </div>

                    {g.cancellable.length > 0 ? (
                      pendingAll ? (
                        <span className="rounded-xl border border-warn/40 bg-warn/15 px-3 py-2 text-xs font-semibold text-warn">
                          İptal talebi onay bekliyor
                        </span>
                      ) : (
                        <button
                          type="button"
                          data-mutates=""
                          onClick={() => void handleCancelGroup(g)}
                          disabled={saving}
                          style={{ minHeight: "var(--tap-action)" }}
                          className="inline-flex items-center gap-1 rounded-xl border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger/20 disabled:opacity-50"
                        >
                          <Icon name="trash" size={14} />
                          {g.isToday ? "İptal Et" : "İptal Talebi Gönder"}
                        </button>
                      )
                    ) : null}
                  </div>

                  {g.products.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {g.products.map((p) => (
                        <span key={p.productId} className="rounded-lg border border-border bg-bg px-2.5 py-1 text-xs text-text">
                          {p.productName}: <strong className="text-ok">+{p.added}</strong>
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {marks.map((tx) => (
                    <div key={tx.id} className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span
                        data-testid="islem-turu"
                        className={`rounded-full border px-2 py-0.5 font-bold ${BADGE_TONE[tx.typeBadgeColor] ?? BADGE_TONE.slate}`}
                      >
                        {tx.typeLabel}
                      </span>
                      <span className="tabular-nums">{timeOf(tx.occurredAt)}</span>
                      <span className="italic">{emptyText(tx)}</span>
                      {tx.note ? (
                        <span>
                          {tx.kind === "MMD" ? "Sebep" : "Not"}: {tx.note}
                        </span>
                      ) : null}
                      {tx.pendingCorrection ? (
                        <span className="font-semibold text-warn">Talep onay bekliyor</span>
                      ) : null}
                    </div>
                  ))}

                  {withItems.length > 0 ? (
                    <details className="rounded-xl border border-border bg-bg px-3 py-2">
                      <summary className="cursor-pointer text-xs font-semibold text-text">
                        Kayıtlar ({withItems.length})
                      </summary>
                      <ul className="mt-2 space-y-2">
                        {withItems.map((tx) => (
                          <li key={tx.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-text">
                              <span
                                data-testid="islem-turu"
                                className={`rounded-full border px-2 py-0.5 font-bold ${BADGE_TONE[tx.typeBadgeColor] ?? BADGE_TONE.slate}`}
                              >
                                {tx.typeLabel}
                              </span>
                              <span className="tabular-nums text-muted">{timeOf(tx.occurredAt)}</span>
                              {tx.items.map((it) => (
                                <span key={it.productId}>
                                  {it.productName} <strong className="text-ok">+{it.added}</strong>
                                </span>
                              ))}
                              {tx.note ? <span className="text-muted">Not: {tx.note}</span> : null}
                              {tx.pendingCorrection ? (
                                <span className="font-semibold text-warn">Talep onay bekliyor</span>
                              ) : null}
                            </span>
                            {canEditRecord(tx) && !tx.pendingCorrection ? (
                              <button
                                type="button"
                                data-mutates=""
                                onClick={() => openEdit(tx)}
                                style={{ minHeight: "var(--tap-action)" }}
                                className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text hover:bg-bg"
                              >
                                <Icon name="edit" size={14} />
                                {tx.isToday ? "Değiştir" : "Düzeltme Talep Et"}
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
          </>
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
                onClick={() => void closeEdit()}
                style={{ minHeight: "var(--tap-action)" }}
                className="rounded-xl border border-border bg-bg px-4 py-2 text-xs font-semibold text-text hover:bg-surface"
              >
                Vazgeç
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
              Geçmiş Tarihli Kayıt — Düzeltme Talebi
            </h2>
            <p className="text-xs text-muted">
              Geçmiş tarihli oda kontrol kayıtları yalnızca Oda Servisi Sorumlusu onayı ile değiştirilebilir.
            </p>
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
            <textarea
              rows={3}
              aria-label="Düzeltme gerekçesi"
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              placeholder="Düzeltme gerekçenizi detaylı yazın..."
              className="w-full rounded-xl border border-border bg-bg p-3 text-sm text-text placeholder:text-muted"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void closeCorrection()}
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
                Onaya Gönder
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
