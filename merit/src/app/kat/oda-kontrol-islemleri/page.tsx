"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { BackLink } from "@/components/staff/BackLink";
import { screenTitle } from "@/components/staff/screenTitle";
import { askReason } from "@/components/ui/reason";
import { hotelFromAddress } from "@/shell/useInShellFrame";
import { mbFetch } from "@/modules/minibar/ui/mbFetch";
import type { AdminCheckList, AdminCheckRow } from "@/modules/minibar/server/roomCheckAdminService";
import { notify } from "@/shell/notify";

/**
 * Oda Kontrol İşlemleri (MB-OKI): the room check records of all staff. Default is the current business day (the
 * server answers with it); a day or a from-to range and one staff member narrow it. Without `?hotelId=` (the
 * window banner's "Tüm Oteller") every hotel where the user may view the screen is listed, with a hotel column.
 * Editing and deleting (MB-OKI D) work on any day; MyBar fulfilment records are read-only.
 */

const BADGE_TONE: Record<AdminCheckRow["typeBadgeColor"], string> = {
  emerald: "border-ok/40 bg-ok/15 text-ok",
  slate: "border-border bg-bg text-text",
  amber: "border-accent/40 bg-accent/10 text-accent",
};

const FIELD =
  "min-h-[var(--tap-std)] rounded-[var(--radius-m)] border border-border bg-bg px-3 text-sm text-text focus:border-accent focus:outline-none";
const ACTION_BTN =
  "inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-semibold disabled:opacity-50";

const DELETE_REASONS = ["Yanlış oda seçildi", "Adet hatalı girildi", "Mükerrer kayıt"] as const;

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("tr-TR", { timeZone: "Europe/Nicosia", hour: "2-digit", minute: "2-digit" });
const dayText = (dateStr: string) => dateStr.split("-").reverse().join(".");

type Filters = { mode: "day" | "range"; day: string; from: string; to: string; userId: string };

function query(f: Filters, hotelId: string): string {
  const p = new URLSearchParams();
  if (hotelId) p.set("hotelId", hotelId);
  if (f.mode === "day") {
    if (f.day) p.set("day", f.day);
  } else {
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
  }
  if (f.userId) p.set("userId", f.userId);
  return p.size > 0 ? `?${p.toString()}` : "";
}

export default function OdaKontrolIslemleriPage() {
  const [hotelId, setHotelId] = useState("");
  const [filters, setFilters] = useState<Filters>({ mode: "day", day: "", from: "", to: "", userId: "" });
  const [data, setData] = useState<AdminCheckList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<AdminCheckRow | null>(null);
  const [editQty, setEditQty] = useState<Record<string, number>>({});
  const [editNote, setEditNote] = useState("");

  const load = useCallback(async (f: Filters, hotel: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await mbFetch(`/api/minibar/room-checks${query(f, hotel)}`);
      const json = (await res.json()) as AdminCheckList & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Kayıtlar alınamadı.");
      setData(json);
      // The server resolved the default day / range: show it in the fields.
      setFilters((prev) =>
        prev.mode === "day" ? { ...prev, day: json.from } : { ...prev, from: json.from, to: json.to },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // The address is read after mount (no hydration mismatch); the first load follows in the same tick.
    const t = setTimeout(() => {
      const hotel = hotelFromAddress();
      setHotelId(hotel);
      void load({ mode: "day", day: "", from: "", to: "", userId: "" }, hotel);
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const apply = (next: Filters) => {
    setFilters(next);
    void load(next, hotelId);
  };

  const rows = data?.rows ?? [];
  const showHotel = hotelId === "" && (data?.hotels.length ?? 0) > 1;

  const openEdit = (row: AdminCheckRow) => {
    const map: Record<string, number> = {};
    for (const it of row.items) map[it.productId] = it.added;
    setEditQty(map);
    setEditNote(row.note ?? "");
    setEditing(row);
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await mbFetch(`/api/minibar/room-checks/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updatedItems: Object.entries(editQty).map(([productId, qty]) => ({ productId, qty })),
          note: editNote,
        }),
      });
      const json = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Güncellenemedi.");
      setEditing(null);
      await load(filters, hotelId);
      notify.success(json.message ?? "Kayıt güncellendi.");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Güncelleme hatası");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: AdminCheckRow) => {
    const reason = await askReason({
      title: `Oda ${row.roomNumber} kaydı silinsin mi?`,
      message: `${row.userName} · ${dayText(row.dateStr)} ${timeOf(row.occurredAt)}. Kayıt silinir; eklenen ürünler otel deposuna geri döner. Bu işlem geri alınamaz ve denetim günlüğüne yazılır.`,
      reasons: DELETE_REASONS,
      minLength: 3,
      confirmLabel: "Sil",
      danger: true,
    });
    if (!reason) return;
    setSaving(true);
    try {
      const res = await mbFetch(`/api/minibar/room-checks/${row.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Silinemedi.");
      await load(filters, hotelId);
      notify.success(json.message ?? "Kayıt silindi.");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Silme hatası");
    } finally {
      setSaving(false);
    }
  };

  const productsOf = (row: AdminCheckRow) =>
    row.items.length > 0 ? (
      <span className="flex flex-wrap gap-1.5">
        {row.items.map((it) => (
          <span key={it.productId} className="rounded-lg border border-border bg-bg px-2 py-0.5 text-xs text-text">
            {it.productName} <strong className="text-ok">+{it.added}</strong>
          </span>
        ))}
      </span>
    ) : (
      <span className="text-xs italic text-muted">{row.type === "SARFIYAT_YOK" ? "Sarfiyat yok, minibar tam" : "Ürün yok"}</span>
    );

  const badge = (row: AdminCheckRow) => (
    <span data-testid="islem-turu" className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-bold ${BADGE_TONE[row.typeBadgeColor]}`}>
      {row.typeLabel}
    </span>
  );

  const actions = (row: AdminCheckRow, first: boolean) =>
    row.canEdit || row.canDelete ? (
      <span className="flex flex-wrap gap-2">
        {row.canEdit ? (
          <button
            type="button"
            data-mutates=""
            data-guide={first ? "oki-duzenle" : undefined}
            onClick={() => openEdit(row)}
            disabled={saving}
            style={{ minHeight: "var(--tap-action)" }}
            className={`${ACTION_BTN} border-border bg-surface text-text hover:bg-bg`}
          >
            <Icon name="edit" size={14} />
            Düzenle
          </button>
        ) : null}
        {row.canDelete ? (
          <button
            type="button"
            data-mutates=""
            data-guide={first ? "oki-sil" : undefined}
            onClick={() => void remove(row)}
            disabled={saving}
            style={{ minHeight: "var(--tap-action)" }}
            className={`${ACTION_BTN} border-danger/40 bg-danger/10 text-danger hover:bg-danger/20`}
          >
            <Icon name="trash" size={14} />
            Sil
          </button>
        ) : null}
      </span>
    ) : (
      <span className="text-xs text-muted">Salt okunur</span>
    );

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="sticky top-[var(--staff-head-h,0px)] z-20 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <BackLink />
          <div className="min-w-0">
            <h1 className="text-lg font-bold">{screenTitle("MB-OKI")}</h1>
            <p className="text-xs text-muted">Bütün personelin oda kontrol kayıtları; gün ve personele göre süzülür</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div data-guide="oki-filtre" className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-col gap-1" role="group" aria-label="Tarih türü">
            <span className="text-xs font-semibold text-muted">Tarih</span>
            <div className="flex gap-2">
              {(
                [
                  ["day", "Tek gün"],
                  ["range", "Aralık"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={filters.mode === mode}
                  onClick={() =>
                    apply(
                      mode === "range"
                        ? { ...filters, mode, from: filters.day, to: filters.day }
                        : { ...filters, mode, day: filters.from || filters.day },
                    )
                  }
                  style={{ minHeight: "var(--tap-std)" }}
                  className={`rounded-xl border px-3 text-xs font-semibold ${
                    filters.mode === mode ? "border-accent bg-accent text-white" : "border-border bg-bg text-text hover:bg-surface"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filters.mode === "day" ? (
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Gün
              <input
                type="date"
                value={filters.day}
                onChange={(e) => e.target.value && apply({ ...filters, day: e.target.value })}
                className={FIELD}
              />
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                Başlangıç
                <input
                  type="date"
                  value={filters.from}
                  max={filters.to || undefined}
                  onChange={(e) => e.target.value && apply({ ...filters, from: e.target.value })}
                  className={FIELD}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
                Bitiş
                <input
                  type="date"
                  value={filters.to}
                  min={filters.from || undefined}
                  onChange={(e) => e.target.value && apply({ ...filters, to: e.target.value })}
                  className={FIELD}
                />
              </label>
            </>
          )}

          <label className="flex min-w-48 flex-col gap-1 text-xs font-semibold text-muted">
            Personel
            <select value={filters.userId} onChange={(e) => apply({ ...filters, userId: e.target.value })} className={FIELD}>
              <option value="">Tüm personel</option>
              {(data?.staff ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
              {filters.userId && !(data?.staff ?? []).some((u) => u.id === filters.userId) ? (
                <option value={filters.userId}>Seçili personel</option>
              ) : null}
            </select>
          </label>

          <button
            type="button"
            onClick={() => void load(filters, hotelId)}
            disabled={loading}
            style={{ minHeight: "var(--tap-std)" }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-bg px-3 text-xs font-semibold text-text hover:bg-surface disabled:opacity-50"
          >
            <Icon name="refresh" size={14} />
            Yenile
          </button>
        </div>

        {error ? (
          <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-5 text-sm text-danger">
            {error}
          </div>
        ) : loading && !data ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">Kayıtlar yükleniyor...</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
            Seçilen tarih ve personel için oda kontrol kaydı yok.
          </div>
        ) : (
          <div data-guide="oki-liste" className="space-y-2">
            <p className="text-xs text-muted" aria-live="polite">
              {rows.length} kayıt
              {data?.truncated ? " (en yeni kayıtlar; liste kesildi, aralığı daralt)" : ""}
            </p>

            <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b-2 border-border bg-bg text-xs text-text">
                  <tr>
                    <th scope="col" className="px-3 py-2">Saat</th>
                    {showHotel ? <th scope="col" className="px-3 py-2">Otel</th> : null}
                    <th scope="col" className="px-3 py-2">Oda</th>
                    <th scope="col" className="px-3 py-2">Personel</th>
                    <th scope="col" className="px-3 py-2">Tür</th>
                    <th scope="col" className="px-3 py-2">Ürünler</th>
                    <th scope="col" className="px-3 py-2">Not</th>
                    <th scope="col" className="px-3 py-2">
                      <span className="sr-only">İşlemler</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.id} data-testid="islem-satiri" className={`border-b border-border align-top last:border-b-0 ${i % 2 === 0 ? "bg-surface" : "bg-bg"}`}>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        <span className="block text-xs text-muted">{dayText(row.dateStr)}</span>
                        {timeOf(row.occurredAt)}
                      </td>
                      {showHotel ? <td className="px-3 py-2">{row.hotelName}</td> : null}
                      <td className="whitespace-nowrap px-3 py-2">
                        <strong>Oda {row.roomNumber}</strong>
                        <span className="block text-xs text-muted">{row.floorName}</span>
                      </td>
                      <td className="px-3 py-2">{row.userName}</td>
                      <td className="px-3 py-2">{badge(row)}</td>
                      <td className="px-3 py-2">{productsOf(row)}</td>
                      <td className="max-w-56 px-3 py-2 text-xs text-muted">{row.note ?? ""}</td>
                      <td className="px-3 py-2">{actions(row, i === 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-2 md:hidden">
              {rows.map((row) => (
                <li key={row.id} className="space-y-2 rounded-2xl border border-border bg-surface p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm">
                      <strong>Oda {row.roomNumber}</strong> <span className="text-xs text-muted">({row.floorName})</span>
                    </p>
                    {badge(row)}
                  </div>
                  <p className="text-xs text-muted">
                    {dayText(row.dateStr)} <span className="tabular-nums">{timeOf(row.occurredAt)}</span> · {row.userName}
                    {showHotel ? ` · ${row.hotelName}` : ""}
                  </p>
                  {productsOf(row)}
                  {row.note ? <p className="text-xs text-muted">Not: {row.note}</p> : null}
                  {actions(row, false)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>

      {editing ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="oki-edit-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-surface p-5 text-text">
            <div>
              <h2 id="oki-edit-title" className="text-base font-bold">
                Oda {editing.roomNumber} kaydını düzenle
              </h2>
              <p className="text-xs text-muted">
                {editing.userName} · {dayText(editing.dateStr)} {timeOf(editing.occurredAt)}
                {showHotel ? ` · ${editing.hotelName}` : ""}. Adet farkı otel deposuna işlenir.
              </p>
            </div>
            {editing.items.length > 0 ? (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {editing.items.map((it) => (
                  <div key={it.productId} className="flex items-center justify-between rounded-xl border border-border bg-bg px-3 py-2">
                    <span className="text-xs font-medium">{it.productName}</span>
                    <input
                      type="number"
                      min={0}
                      max={999}
                      aria-label={`${it.productName} adet`}
                      value={editQty[it.productId] ?? 0}
                      onChange={(e) => setEditQty((prev) => ({ ...prev, [it.productId]: Math.max(0, Math.trunc(Number(e.target.value)) || 0) }))}
                      className="min-h-11 w-20 rounded-xl border border-border bg-surface px-2 text-center text-sm font-bold tabular-nums text-text"
                    />
                  </div>
                ))}
              </div>
            ) : null}
            <input
              type="text"
              aria-label="Açıklama notu"
              maxLength={300}
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="Açıklama notu..."
              className={`${FIELD} w-full placeholder:text-muted`}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                style={{ minHeight: "var(--tap-action)" }}
                className="rounded-xl border border-border bg-bg px-4 py-2 text-xs font-semibold text-text hover:bg-surface"
              >
                Vazgeç
              </button>
              <button
                type="button"
                data-mutates=""
                onClick={() => void save()}
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
    </div>
  );
}
