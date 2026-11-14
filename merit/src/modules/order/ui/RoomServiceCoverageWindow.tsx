"use client";

import { type CSSProperties, useCallback, useEffect, useId, useState } from "react";
import { HotelBadge } from "@/components/ui/HotelBadge";
import {
  grantCoverageAction,
  listCoverageAction,
  revokeCoverageAction,
} from "@/modules/order/server/actions/roomServiceCoverage";
import type { CoverageMode, CoverageOverview, CoverageRow, CoverageState } from "@/modules/order/server/roomService/coverage";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import type { AppProps } from "@/shell/registry";

type Preset = "2h" | "today" | "1d" | "10d" | "open" | "custom";

const PRESETS: readonly { id: Preset; label: string }[] = [
  { id: "2h", label: "2 saat" },
  { id: "today", label: "Bugün sonuna kadar" },
  { id: "1d", label: "1 gün" },
  { id: "10d", label: "10 gün" },
  { id: "open", label: "Süresiz" },
  { id: "custom", label: "Özel bitiş" },
];

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const TZ = "Europe/Nicosia";

const MODE_LABEL: Record<CoverageMode, string> = { IZLEME: "Yalnızca izleme", ISLEME: "İzleme ve işleme" };
const STATE_LABEL: Record<CoverageState, string> = {
  AKTIF: "Aktif",
  PLANLI: "Planlı",
  BITTI: "Süresi doldu",
  KALDIRILDI: "Kaldırıldı",
};

// Tablet-sized touch targets.
const TOUCH: CSSProperties = { minHeight: 44, fontSize: 16 };
const CELL: CSSProperties = { padding: "6px 8px", textAlign: "left", verticalAlign: "middle" };
const FIELD: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, minWidth: 200, flex: "1 1 200px" };

/** Milliseconds from `now` to the next midnight in the hotels' time zone. */
function untilMidnight(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(now)
    .reduce<Record<string, number>>((acc, p) => (p.type === "literal" ? acc : { ...acc, [p.type]: Number(p.value) }), {});
  return DAY_MS - ((parts.hour ?? 0) * 3600 + (parts.minute ?? 0) * 60 + (parts.second ?? 0)) * 1000;
}

/** End of the chosen duration, `null` for an open-ended grant, `undefined` when the custom end is missing or invalid. */
function endOf(preset: Preset, custom: string, now: Date): Date | null | undefined {
  switch (preset) {
    case "2h":
      return new Date(now.getTime() + 2 * HOUR_MS);
    case "today":
      return new Date(now.getTime() + untilMidnight(now));
    case "1d":
      return new Date(now.getTime() + DAY_MS);
    case "10d":
      return new Date(now.getTime() + 10 * DAY_MS);
    case "open":
      return null;
    case "custom": {
      const end = custom ? new Date(custom) : null;
      return end && !Number.isNaN(end.getTime()) && end.getTime() > now.getTime() ? end : undefined;
    }
  }
}

function when(value: Date | string | null): string {
  if (!value) return "Süresiz";
  return new Date(value).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: TZ });
}

/**
 * "Oteller Arası Oda Servisi": who may watch or process the room-service requests of which other hotel, and
 * until when. For the Oda Servisi Sorumlusu, the F&B managers and the system administrator; the server
 * authorizes every call (roomService/coverage.ts) and writes every grant, change and revoke to the audit log.
 */
export function RoomServiceCoverageWindow({ setStatus }: AppProps) {
  const id = useId();
  const [data, setData] = useState<CoverageOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState("");
  const [hotelId, setHotelId] = useState("");
  const [mode, setMode] = useState<CoverageMode>("IZLEME");
  const [preset, setPreset] = useState<Preset>("2h");
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await listCoverageAction();
      if (r.ok) {
        setData(r.data);
        setError(null);
      } else {
        setError(r.error.message);
      }
    } catch {
      setError("İzinler yüklenemedi");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    // Grants end on their own: keep the list honest while the window stays open.
    const poll = window.setInterval(() => void load(), 60_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
  }, [load]);

  const candidate = data?.candidates.find((c) => c.id === userId);
  // What the Yetki Matrisi lets this user do besides looking (RO-OTA create / edit), per hotel.
  const mayGrant = data ? data.hotels.some((h) => h.canGrant) : false;
  const revocable = new Set(data ? data.hotels.filter((h) => h.canRevoke).map((h) => h.id) : []);
  // The user's own hotels are never a target: they already work there.
  const hotelOptions =
    data && candidate ? data.hotels.filter((h) => h.canGrant && !candidate.hotelIds.includes(h.id)) : [];
  const hotelValue = hotelOptions.some((h) => h.id === hotelId) ? hotelId : (hotelOptions[0]?.id ?? "");
  // Why some hotels are missing from the list: said in words, or the short list looks like a fault.
  const ownHotelNames = data && candidate ? data.hotels.filter((h) => candidate.hotelIds.includes(h.id)).map((h) => h.name) : [];
  const customBad = preset === "custom" && endOf(preset, custom, new Date()) === undefined;
  const canSubmit = !busy && candidate !== undefined && hotelValue !== "" && !customBad;

  const submit = async () => {
    if (!canSubmit || !candidate) return;
    const endsAt = endOf(preset, custom, new Date());
    if (endsAt === undefined) return;
    setBusy(true);
    setError(null);
    try {
      const r = await grantCoverageAction({
        userId: candidate.id,
        hotelId: hotelValue,
        mode,
        endsAt: endsAt ? endsAt.toISOString() : null,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      if (r.ok) {
        notify.success("İzin verildi.");
        setStatus(`${r.data.user.fullName}: ${r.data.hotel.name} · ${MODE_LABEL[r.data.mode]} · ${when(r.data.endsAt)}`);
        setNote("");
        await load();
      } else {
        const message = Object.values(r.error.fieldErrors ?? {})[0]?.[0] ?? r.error.message;
        setError(message);
        notify.error(`İzin verilemedi: ${message}`);
      }
    } catch {
      setError("İzin verilemedi");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (row: CoverageRow) => {
    const ok = await confirm({
      title: "İzin kaldırılsın mı?",
      message: `${row.user.fullName} artık ${row.hotel.name} oda servisi taleplerini göremeyecek.`,
      danger: true,
      confirmLabel: "Kaldır",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await revokeCoverageAction({ id: row.id });
      if (r.ok) {
        notify.success("İzin kaldırıldı.");
        setStatus(`${row.user.fullName}: ${row.hotel.name} izni kaldırıldı`);
      } else {
        setError(r.error.message);
        notify.error(`İzin kaldırılamadı: ${r.error.message}`);
      }
      await load();
    } catch {
      setError("İzin kaldırılamadı");
    } finally {
      setBusy(false);
    }
  };

  const open = data?.rows.filter((r) => r.state === "AKTIF" || r.state === "PLANLI") ?? [];
  const past = data?.rows.filter((r) => r.state === "BITTI" || r.state === "KALDIRILDI") ?? [];

  return (
    <div className="xp-cp-main">
      <section className="xp-cp-section" aria-labelledby={`${id}-title`}>
        <h3 id={`${id}-title`} className="xp-cp-heading">
          Oteller arası oda servisi
        </h3>
        <p className="xp-cp-note">
          Bir kullanıcıya, kendi oteli dışındaki bir otelin oda servisi taleplerini belirli bir süre izleme ya da işleme
          izni verirsiniz. İzin yalnızca oda servisi taleplerini açar; süre dolunca kendiliğinden biter. İşleme izni
          olan kullanıcı, kendi otelinde hangi işlemleri yapabiliyorsa diğer otelin taleplerinde de yalnızca onları
          yapar. Her izin, değişiklik ve kaldırma denetim kaydına yazılır.
        </p>
        {error ? (
          <p role="alert" className="xp-defs-error" style={{ padding: "4px 0" }}>
            {error}
          </p>
        ) : null}
        {data === null && !error ? <p className="xp-cp-note">Yükleniyor…</p> : null}
      </section>

      {data ? (
        <section className="xp-cp-section" aria-labelledby={`${id}-new`} data-guide="ota-yeni">
          <h3 id={`${id}-new`} className="xp-cp-heading">
            Yeni izin
          </h3>
          {!mayGrant ? (
            <p className="xp-cp-note" data-coverage-view-only>
              İzinleri görüntüleyebilirsiniz; yeni izin vermek için Yetki Matrisi&apos;nde bu ekranın oluşturma yetkisi gerekir.
            </p>
          ) : data.candidates.length === 0 ? (
            <p className="xp-cp-note">İzin verebileceğiniz bir kullanıcı yok.</p>
          ) : (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                <div style={FIELD}>
                  <label htmlFor={`${id}-user`}>Kullanıcı</label>
                  <select
                    id={`${id}-user`}
                    className="xp-system-select"
                    style={TOUCH}
                    value={userId}
                    disabled={busy}
                    onChange={(e) => setUserId(e.target.value)}
                  >
                    <option value="">Kullanıcı seçin</option>
                    {data.candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {`${c.fullName} · ${c.roleName}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={FIELD}>
                  <label htmlFor={`${id}-hotel`}>Talepleri görülecek otel</label>
                  <select
                    id={`${id}-hotel`}
                    className="xp-system-select"
                    style={TOUCH}
                    value={hotelValue}
                    disabled={busy || hotelOptions.length === 0}
                    onChange={(e) => setHotelId(e.target.value)}
                  >
                    {hotelOptions.length === 0 ? <option value="">Önce kullanıcı seçin</option> : null}
                    {hotelOptions.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                  {candidate && ownHotelNames.length > 0 ? (
                    <p className="xp-cp-note" style={{ margin: 0 }} data-coverage-own-hotels>
                      {`${candidate.fullName} ekip üyesi olduğu ${ownHotelNames.join(", ")} taleplerini zaten kendi yetkisiyle görür ve işler; bu yüzden listede yalnızca diğer oteller var.`}
                    </p>
                  ) : null}
                </div>
                <div style={FIELD}>
                  <label htmlFor={`${id}-mode`}>İzin türü</label>
                  <select
                    id={`${id}-mode`}
                    className="xp-system-select"
                    style={TOUCH}
                    value={mode}
                    disabled={busy}
                    onChange={(e) => setMode(e.target.value === "ISLEME" ? "ISLEME" : "IZLEME")}
                  >
                    <option value="IZLEME">Yalnızca izleme (talepleri görür)</option>
                    <option value="ISLEME">İzleme ve işleme (talepleri görür ve ilerletir)</option>
                  </select>
                </div>
              </div>

              <fieldset style={{ border: 0, padding: 0, margin: "12px 0 0" }}>
                <legend style={{ fontWeight: 600, marginBottom: 4 }}>Süre</legend>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="xp-button"
                      style={{ ...TOUCH, fontWeight: preset === p.id ? 700 : 400, outline: preset === p.id ? "2px solid currentColor" : undefined }}
                      aria-pressed={preset === p.id}
                      disabled={busy}
                      onClick={() => setPreset(p.id)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {preset === "custom" ? (
                  <div style={{ ...FIELD, marginTop: 8, maxWidth: 280 }}>
                    <label htmlFor={`${id}-end`}>Bitiş tarihi ve saati</label>
                    <input
                      id={`${id}-end`}
                      type="datetime-local"
                      className="xp-system-input"
                      style={TOUCH}
                      value={custom}
                      disabled={busy}
                      aria-invalid={customBad}
                      onChange={(e) => setCustom(e.target.value)}
                    />
                    {customBad ? (
                      <p role="alert" className="xp-defs-error" style={{ padding: 0 }}>
                        İleri bir tarih ve saat seçin.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </fieldset>

              <div style={{ ...FIELD, marginTop: 12 }}>
                <label htmlFor={`${id}-note`}>Not (isteğe bağlı)</label>
                <input
                  id={`${id}-note`}
                  type="text"
                  className="xp-system-input"
                  style={TOUCH}
                  maxLength={200}
                  value={note}
                  disabled={busy}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <p className="xp-cp-note" style={{ margin: "8px 0" }}>
                Kullanıcının bu otel için süren bir izni varsa yenisi onun yerine geçer.
              </p>
              <button type="submit" className="xp-button" style={{ ...TOUCH, minWidth: 140 }} disabled={!canSubmit}>
                {busy ? "Kaydediliyor…" : "İzin ver"}
              </button>
            </form>
          )}
        </section>
      ) : null}

      {data ? (
        <section className="xp-cp-section" aria-labelledby={`${id}-open`} data-guide="ota-suren">
          <h3 id={`${id}-open`} className="xp-cp-heading">
            Süren izinler
          </h3>
          {open.length === 0 ? (
            <p className="xp-cp-note">Süren bir izin yok.</p>
          ) : (
            <GrantTable rows={open} busy={busy} revocable={revocable} onRevoke={(row) => void revoke(row)} />
          )}
        </section>
      ) : null}

      {data && past.length > 0 ? (
        <section className="xp-cp-section" aria-labelledby={`${id}-past`} data-guide="ota-biten">
          <h3 id={`${id}-past`} className="xp-cp-heading">
            Son bir haftada süresi dolan izinler
          </h3>
          <GrantTable rows={past} busy={busy} />
        </section>
      ) : null}
    </div>
  );
}

function GrantTable({
  rows,
  busy,
  revocable,
  onRevoke,
}: {
  rows: CoverageRow[];
  busy: boolean;
  /** Hotels whose grants the user may remove (RO-OTA edit); the others show no button. */
  revocable?: Set<string>;
  onRevoke?: (row: CoverageRow) => void;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr>
            {["Kullanıcı", "Otel", "İzin", "Başlangıç", "Bitiş", "Veren", "Durum"].map((h) => (
              <th key={h} scope="col" style={{ ...CELL, fontWeight: 700, borderBottom: "1px solid currentColor" }}>
                {h}
              </th>
            ))}
            {onRevoke ? (
              <th scope="col" style={{ ...CELL, borderBottom: "1px solid currentColor" }}>
                <span className="sr-only">İşlem</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-coverage-id={row.id} data-coverage-state={row.state}>
              <td style={CELL}>
                <strong>{row.user.fullName}</strong>
                <br />
                <span>{row.user.roleName}</span>
              </td>
              <td style={CELL}>
                <HotelBadge name={row.hotel.name} />
              </td>
              <td style={CELL}>{MODE_LABEL[row.mode]}</td>
              <td style={CELL}>{when(row.startsAt)}</td>
              <td style={CELL}>{row.revokedAt ? when(row.revokedAt) : when(row.endsAt)}</td>
              <td style={CELL}>{row.grantedByName}</td>
              <td style={CELL}>
                {STATE_LABEL[row.state]}
                {row.revokedByName ? ` (${row.revokedByName})` : ""}
                {row.note ? (
                  <>
                    <br />
                    <span>{row.note}</span>
                  </>
                ) : null}
              </td>
              {onRevoke ? (
                <td style={CELL}>
                  {revocable?.has(row.hotel.id) ? (
                    <button type="button" className="xp-button" style={TOUCH} disabled={busy} onClick={() => onRevoke(row)}>
                      Kaldır
                    </button>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
