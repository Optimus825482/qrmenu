"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/icons/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { UPLOAD_LABELS, roomCellModel, type RoomCell } from "../../labels";
import type { RadarState } from "../../state";
import { DetailBubble } from "../DetailBubble";
import { nextCell, type GridNavKey } from "../gridNav";
import { usePulse } from "../useRadar";

type Minibar = NonNullable<RadarState["layers"]["minibar"]>;

const CHECK_LABELS: Record<NonNullable<RoomCell["checkedToday"]>["type"], string> = {
  URUN_EKLENDI: "Ürün eklendi",
  SARFIYAT_YOK: "Sarfiyat yok",
  DND: "DND",
  ACIK: "Açık",
};

const UPLOAD_STATUS: Record<string, string> = {
  EKSIK: "Yüklenmedi",
  YUKLENDI: "Yüklendi",
  ISLENIYOR: "İşleniyor",
  TAMAMLANDI: "Yüklendi",
  HATA: "Hata",
  SILINDI: "Silindi",
  BEKLIYOR: "Bekliyor",
};

const clock = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Nicosia", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );

function Cell({
  room,
  now,
  focusable,
  selected,
  onSelect,
  onKeyDown,
}: {
  room: RoomCell;
  now: number;
  focusable: boolean;
  selected: boolean;
  onSelect(): void;
  onKeyDown(e: KeyboardEvent<HTMLDivElement>): void;
}) {
  const m = roomCellModel(room, now);
  const ref = usePulse<HTMLDivElement>(`room:${room.roomId}`);
  return (
    <div
      ref={ref}
      role="gridcell"
      className="rd-cell"
      data-tone={m.tone}
      data-edge={m.edge}
      data-room-id={room.roomId}
      data-anchor={`room:${room.roomId}`}
      aria-label={m.ariaLabel}
      aria-selected={selected}
      tabIndex={focusable ? 0 : -1}
      onClick={onSelect}
      onDoubleClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <span>{room.number}</span>
      {m.corner.length > 0 ? (
        // Painted by CSS from data-marks: the marks are not text content, so the visible label of the cell stays
        // the room number and the accessible name (which starts with it and spells the marks out) matches it.
        <span className="rd-cell-corner" aria-hidden="true" data-marks={m.corner.join(" ")} />
      ) : null}
      {m.checked ? (
        <span className="rd-cell-tick" aria-hidden="true">
          <Icon name="check" size={12} />
        </span>
      ) : null}
    </div>
  );
}

function RoomDetail({
  room,
  floorName,
  state,
  now,
  onClose,
  onOpenApp,
}: {
  room: RoomCell;
  floorName: string;
  state: RadarState;
  now: number;
  onClose(): void;
  onOpenApp?: (id: string) => void;
}) {
  const m = roomCellModel(room, now);
  const who = (id: string) => state.people[id] ?? "Bilinmiyor";
  return (
    <DetailBubble
      title={`Oda ${room.number} · ${floorName}`}
      ariaLabel={`Oda ${room.number} ayrıntısı`}
      hotelId={state.hotelId}
      appTarget={{ screenCode: "MB-KAT", modulePrefix: "minibar.", fallbackAppId: "minibar.kat" }}
      onOpenApp={onOpenApp}
      onClose={onClose}
    >
      <p>{m.ariaLabel.slice(room.number.length + 2)}</p>
      {room.checkedToday ? (
        <p>
          Bugün kontrol: {CHECK_LABELS[room.checkedToday.type]} · {clock(room.checkedToday.at)} ·{" "}
          {who(room.checkedToday.userId)}
        </p>
      ) : (
        <p className="rd-muted">Bugün kontrol edilmedi.</p>
      )}
      {room.mybar ? (
        <p>MyBar talebi {room.mybar.seen ? "onaylandı, tamamlanmayı bekliyor" : "onay bekliyor"} · {clock(room.mybar.since)}</p>
      ) : null}
    </DetailBubble>
  );
}

const NAV_KEYS = new Set<GridNavKey>(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]);

export type FloorProps = {
  view: RadarState;
  now: number;
  onFocus?(entity: { kind: "room"; roomId: string } | null): void;
  onOpenApp?(appId: string): void;
};

/** Kat: floors as grid rows, rooms as cells (spec 5.3) and the supervisors, pool stock and uploads on the side. */
export function Floor({ view, now, onFocus, onOpenApp }: FloorProps) {
  const minibar: Minibar | undefined = view.layers.minibar;
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  if (!minibar) return <EmptyState title="Minibar katmanı bu kapsamda yok." />;

  const flat = minibar.floors.flatMap((f, fi) => f.rooms.map((r) => ({ room: r, fi })));
  const firstId = flat[0]?.room.roomId ?? null;
  const tabStop = focusId && flat.some((x) => x.room.roomId === focusId) ? focusId : firstId;
  const dims = { rows: minibar.floors.map((f) => f.rooms.length) };

  const move = (fromId: string, e: KeyboardEvent<HTMLDivElement>) => {
    const i = flat.findIndex((x) => x.room.roomId === fromId);
    if (i < 0) return;
    const cur = flat[i];
    const col = minibar.floors[cur.fi].rooms.findIndex((r) => r.roomId === fromId);
    if (NAV_KEYS.has(e.key as GridNavKey)) {
      const next = nextCell(dims, { r: cur.fi, c: col }, e.key as GridNavKey);
      const target = minibar.floors[next.r]?.rooms[next.c];
      if (!target || target.roomId === fromId) return;
      e.preventDefault();
      const id = target.roomId;
      setFocusId(id);
      onFocus?.({ kind: "room", roomId: id });
      gridRef.current?.querySelector<HTMLElement>(`[data-room-id="${id}"]`)?.focus();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelected(fromId);
    } else if (e.key === "Escape") {
      setSelected(null);
    }
  };

  const selectedRoom = selected ? flat.find((x) => x.room.roomId === selected) : undefined;
  const near = minibar.stock.filter((s) => s.remaining <= s.critical * 1.2).sort((a, b) => a.remaining - b.remaining);
  const missingAll = minibar.uploads.length === 0 || minibar.uploads.every((u) => u.status === "EKSIK");

  return (
    <div className="rd-floor">
      <div>
        {flat.length === 0 ? (
          <EmptyState title="Bu otelde oda tanımlı değil." />
        ) : (
          <div ref={gridRef} role="grid" aria-label="Kat ve oda ızgarası" className="rd-floor-grid">
            {minibar.floors.map((f) => (
              <div key={f.floorId} role="row" className="rd-floor-row">
                <div role="rowheader" className="rd-floor-name">
                  {f.name}
                </div>
                <div className="rd-floor-cells" role="presentation">
                  {f.rooms.map((r) => (
                    <Cell
                      key={r.roomId}
                      room={r}
                      now={now}
                      focusable={r.roomId === tabStop}
                      selected={r.roomId === selected}
                      onSelect={() => {
                        setFocusId(r.roomId);
                        setSelected(r.roomId);
                      }}
                      onKeyDown={(e) => move(r.roomId, e)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rd-side">
        {selectedRoom ? (
          <RoomDetail
            room={selectedRoom.room}
            floorName={minibar.floors[selectedRoom.fi].name}
            state={view}
            now={now}
            onClose={() => setSelected(null)}
            onOpenApp={onOpenApp}
          />
        ) : null}

        <section className="rd-panel" aria-label="Kat sorumluları">
          <h3>Kat sorumluları</h3>
          {minibar.supervisors.length === 0 ? (
            <p className="rd-muted">Bugün görev atanmadı.</p>
          ) : (
            <ul className="rd-list">
              {minibar.supervisors.map((s) => {
                const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
                const name = view.people[s.userId] ?? "Kat sorumlusu";
                return (
                  <li key={s.userId} data-anchor={`staff:${s.userId}`}>
                    <div className="rd-row">
                      <span>{name}</span>
                      <span>
                        {s.done}/{s.total}
                      </span>
                    </div>
                    <div className="rd-bar" role="img" aria-label={`${name}: ${s.done}/${s.total} kalem, yüzde ${pct}`}>
                      <span style={{ width: `${pct}%` }} />
                    </div>
                    {s.lastAt ? <span className="rd-muted">Son işlem {clock(s.lastAt)}</span> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rd-panel" aria-label="Otel deposu stoku">
          <h3>Otel deposu stoku</h3>
          {near.length === 0 ? (
            <p className="rd-muted">Kritik ürün yok.</p>
          ) : (
            <ul className="rd-list">
              {near.map((s) => {
                const crit = s.remaining <= s.critical;
                return (
                  <li key={s.productId} className="rd-row" data-anchor={`stock:${s.productId}`}>
                    <span>{s.name}</span>
                    <span className="rd-badge" data-tone={crit ? "danger" : "warn"}>
                      <Icon name={crit ? "error" : "warning"} size={12} />
                      {s.remaining} · {crit ? "Kritik" : "Kritiğe yakın"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rd-panel" aria-label="Doluluk yüklemeleri">
          <h3>Doluluk yüklemeleri</h3>
          {missingAll ? (
            <EmptyState title="Doluluk yüklenmedi" hint="Bugünün dosyaları gelince hücreler dolar." />
          ) : null}
          <ul className="rd-list">
            {minibar.uploads.map((u) => {
              const ok = u.status === "TAMAMLANDI" || u.status === "YUKLENDI";
              return (
                <li key={u.kind} className="rd-row">
                  <span>{UPLOAD_LABELS[u.kind] ?? u.kind}</span>
                  <span className="rd-badge" data-tone={ok ? "success" : u.status === "HATA" ? "danger" : "warn"}>
                    <Icon name={ok ? "check" : "warning"} size={12} />
                    {UPLOAD_STATUS[u.status] ?? u.status}
                    {u.at ? ` · ${clock(u.at)}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
