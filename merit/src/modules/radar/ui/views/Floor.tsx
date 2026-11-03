"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/icons/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { UPLOAD_LABELS, roomCellModel, type RoomCell } from "../../labels";
import type { RadarState } from "../../state";
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
      aria-label={m.ariaLabel}
      aria-selected={selected}
      tabIndex={focusable ? 0 : -1}
      onClick={onSelect}
      onDoubleClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <span>{room.number}</span>
      {m.corner.length > 0 ? (
        <span className="rd-cell-corner" aria-hidden="true">
          {m.corner.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </span>
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
    <section className="rd-panel" aria-label={`Oda ${room.number} ayrıntısı`}>
      <div className="rd-row">
        <h3>
          Oda {room.number} · {floorName}
        </h3>
        <button type="button" className="rd-link" onClick={onClose}>
          Kapat
        </button>
      </div>
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
        <p>MyBar isteği {room.mybar.seen ? "görüldü" : "bekliyor"} · {clock(room.mybar.since)}</p>
      ) : null}
      {onOpenApp ? (
        <button type="button" className="rd-chip" onClick={() => onOpenApp("minibar.kat")}>
          Uygulamada aç
        </button>
      ) : null}
    </section>
  );
}

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

  const move = (fromId: string, e: KeyboardEvent<HTMLDivElement>) => {
    const i = flat.findIndex((x) => x.room.roomId === fromId);
    if (i < 0) return;
    let to = i;
    const cur = flat[i];
    const floorRooms = minibar.floors[cur.fi].rooms;
    const col = floorRooms.findIndex((r) => r.roomId === fromId);
    switch (e.key) {
      case "ArrowRight":
        to = Math.min(flat.length - 1, i + 1);
        break;
      case "ArrowLeft":
        to = Math.max(0, i - 1);
        break;
      case "ArrowDown":
      case "ArrowUp": {
        const dir = e.key === "ArrowDown" ? 1 : -1;
        let fi = cur.fi + dir;
        while (fi >= 0 && fi < minibar.floors.length && minibar.floors[fi].rooms.length === 0) fi += dir;
        if (fi < 0 || fi >= minibar.floors.length) return;
        const target = minibar.floors[fi].rooms[Math.min(col, minibar.floors[fi].rooms.length - 1)];
        to = flat.findIndex((x) => x.room.roomId === target.roomId);
        break;
      }
      case "Home":
        to = flat.findIndex((x) => x.fi === cur.fi);
        break;
      case "End":
        to = flat.length - 1 - [...flat].reverse().findIndex((x) => x.fi === cur.fi);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        setSelected(fromId);
        return;
      case "Escape":
        setSelected(null);
        return;
      default:
        return;
    }
    e.preventDefault();
    const id = flat[to].room.roomId;
    setFocusId(id);
    onFocus?.({ kind: "room", roomId: id });
    gridRef.current?.querySelector<HTMLElement>(`[data-room-id="${id}"]`)?.focus();
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
                  <li key={s.userId}>
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

        <section className="rd-panel" aria-label="Havuz stoku">
          <h3>Havuz stoku</h3>
          {near.length === 0 ? (
            <p className="rd-muted">Kritik ürün yok.</p>
          ) : (
            <ul className="rd-list">
              {near.map((s) => {
                const crit = s.remaining <= s.critical;
                return (
                  <li key={s.productId} className="rd-row">
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
